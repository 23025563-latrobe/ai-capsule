import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { randomBytes } from 'node:crypto'
import { readAuthConfig } from '../../../server/auth-config.js'
import { createSessions } from '../../../server/session.js'
import CapsuleWorkspace from './CapsuleWorkspace'

it('saves the form controls through the actual protected API without losing legacy data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'capsule-form-contract-'))
  const env = {
    PUBLIC_APP_URL: 'https://localhost:5173',
    GITHUB_CALLBACK_URL: 'https://localhost:5173/api/auth/github/callback',
    GITHUB_CLIENT_ID: 'test-client',
    GITHUB_CLIENT_SECRET: 'test-provider-secret',
    JWT_SECRET: randomBytes(32).toString('hex')
  }
  const token = createSessions(readAuthConfig(env)).issue({
    id: '101',
    login: 'fictional-test-account'
  })
  const server = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { createApp } from './server/app.js';
    import { openDatabase } from './server/database.js';
    const database = openDatabase();
    const server = createApp({ database }).listen(0, '127.0.0.1', () => {
      process.stdout.write(String(server.address().port));
    });
    process.once('SIGTERM', () => {
      server.close(() => { database.close(); process.exit(0); });
      server.closeAllConnections();
    });
  `
    ],
    {
      cwd: resolve(process.cwd(), '..'),
      env: {
        ...process.env,
        ...env,
        DATABASE_PATH: join(directory, 'test.sqlite')
      },
      stdio: ['ignore', 'pipe', 'inherit']
    }
  )
  try {
    const port = await new Promise((resolve, reject) => {
      server.stdout.once('data', (data) => resolve(Number(data.toString())))
      server.once('error', reject)
      server.once('exit', () =>
        reject(new Error('The isolated API server exited before startup.'))
      )
    })
    expect(port).toBeGreaterThan(0)
    const nativeFetch = globalThis.fetch
    const request = (path, options = {}) =>
      nativeFetch(`http://127.0.0.1:${port}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          Origin: env.PUBLIC_APP_URL,
          Cookie: `token=${token}`
        }
      })
    const legacy = {
      project_name: 'Fictional Coastal Library',
      prompt_title: 'Original catalogue review',
      prompt_version: 'draft-A',
      prompt_text: 'Compare two catalogue layouts.',
      response_summary: 'A list offers a clear reading order.',
      category: '  Community Mapping  ',
      usefulness: 'Useful after a manual check',
      screenshot_url: 'https://example.com/fictional.png',
      notes: 'Fictional integration record',
      reviewed: false,
      improved: false
    }
    const seeded = await request('/api/capsules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacy)
    })
    expect(seeded.status).toBe(201)
    const original = (await seeded.json()).capsule
    vi.stubGlobal('fetch', request)
    const user = userEvent.setup()
    render(<CapsuleWorkspace onSessionExpired={vi.fn()} />)
    await user.click(
      await screen.findByRole('button', { name: /Original catalogue review/ })
    )
    await user.click(screen.getByRole('button', { name: 'Edit capsule' }))
    expect(screen.getByRole('combobox', { name: /^Usefulness/ })).toHaveValue(
      legacy.usefulness
    )
    expect(screen.getByLabelText(/^Category/)).toHaveValue(legacy.category)
    await user.clear(screen.getByLabelText(/^Prompt title/))
    await user.type(
      screen.getByLabelText(/^Prompt title/),
      'Updated catalogue review'
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', { name: 'Updated catalogue review' })
    ).toBeVisible()
    let records = (await (await request('/api/capsules')).json()).capsules
    expect(records[0]).toEqual({
      ...original,
      prompt_title: 'Updated catalogue review'
    })

    await user.click(screen.getByRole('button', { name: /All capsules/ }))
    await user.click(screen.getByRole('button', { name: /New capsule/ }))
    expect(screen.getByLabelText(/^Prompt version/)).toHaveValue('v1')
    await user.type(
      screen.getByLabelText(/^Project name/),
      'Fictional Map Project'
    )
    await user.type(
      screen.getByLabelText(/^Prompt title/),
      'Compare map legends'
    )
    await user.type(
      screen.getByLabelText(/^Prompt text/),
      'Compare two fictional map legends.'
    )
    await user.type(screen.getByLabelText(/^Category/), 'Cartography')
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Usefulness/ }),
      'Good'
    )
    await user.type(screen.getByLabelText(/^Notes/), 'Keep this optional note.')
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', { name: 'Compare map legends' })
    ).toBeVisible()
    records = (await (await request('/api/capsules')).json()).capsules
    const created = records.find(
      (capsule) => capsule.prompt_title === 'Compare map legends'
    )
    expect(created).toMatchObject({
      category: 'Cartography',
      usefulness: 'Good',
      prompt_version: 'v1',
      notes: 'Keep this optional note.',
      reviewed: false,
      improved: false
    })
    expect(
      screen.getByRole('heading', { name: 'Compare map legends' })
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit capsule' }))
    await user.clear(screen.getByLabelText(/^Prompt version/))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Usefulness/ }),
      'Needs improvement'
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(await screen.findByText('Changes saved.')).toBeVisible()
    records = (await (await request('/api/capsules')).json()).capsules
    expect(records.find((capsule) => capsule.id === created.id)).toEqual({
      ...created,
      prompt_version: '1',
      usefulness: 'Needs improvement'
    })
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      await exited
    }
    rmSync(directory, { recursive: true, force: true })
  }
}, 10_000)
