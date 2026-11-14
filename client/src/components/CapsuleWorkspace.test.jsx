import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CapsuleWorkspace from './CapsuleWorkspace'
import App from '../App'
import { apiRequest } from '../api'

const example = {
  id: 7,
  project_name: 'Fictional Coastal Library',
  prompt_title: 'Compare catalogue layouts',
  prompt_version: '2',
  prompt_text:
    'Suggest two accessible layouts for a fictional library catalogue.',
  response_summary: 'A simple list makes the reading order clearer.',
  category: 'Accessibility',
  usefulness: 'Useful starting point',
  reviewed: false,
  improved: false,
  screenshot_url: 'https://example.com/fictional-layout.png',
  notes: 'Fictional test record. Check focus order.',
  created_at: '2026-11-14T04:00:00.000Z',
  user_id: '101'
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status })

function start(records = []) {
  const fetch = vi.fn().mockResolvedValueOnce(json({ capsules: records }))
  vi.stubGlobal('fetch', fetch)
  const onSessionExpired = vi.fn()
  render(<CapsuleWorkspace onSessionExpired={onSessionExpired} />)
  return { fetch, onSessionExpired, user: userEvent.setup() }
}

async function openExample(user) {
  await user.click(
    await screen.findByRole('button', { name: /Compare catalogue layouts/ })
  )
}

async function fillRequired(user) {
  await user.type(
    screen.getByLabelText(/Project name/),
    'Fictional Coastal Library'
  )
  await user.type(
    screen.getByLabelText(/Prompt title/),
    'Draft a reading guide'
  )
  await user.type(
    screen.getByLabelText(/Prompt text/),
    'Suggest a reading guide for a fictional book club.'
  )
}

describe('capsule workspace', () => {
  it('announces loading before showing an empty collection', async () => {
    let resolve
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    )
    render(<CapsuleWorkspace onSessionExpired={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your capsules'
    )
    resolve(json({ capsules: [] }))
    expect(
      await screen.findByText('A space for your next insight')
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Create your first capsule' })
    ).toBeEnabled()
  })

  it('shows a recoverable loading failure and retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'Temporarily unavailable.' }, 500))
      .mockResolvedValueOnce(json({ capsules: [example] }))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<CapsuleWorkspace onSessionExpired={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporarily unavailable.'
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: /Compare catalogue layouts/ })
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('creates a capsule, prevents duplicate saving and displays the saved record', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    let resolveSave
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /All capsules/ })).toBeDisabled()
    const [path, options] = fetch.mock.calls[1]
    expect(path).toBe('/api/capsules')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      project_name: 'Fictional Coastal Library',
      prompt_title: 'Draft a reading guide',
      prompt_version: '1',
      category: '',
      prompt_text: 'Suggest a reading guide for a fictional book club.',
      response_summary: '',
      usefulness: '',
      screenshot_url: '',
      notes: '',
      reviewed: false,
      improved: false
    })
    resolveSave(
      json({ capsule: { ...example, ...JSON.parse(options.body) } }, 201)
    )
    expect(
      await screen.findByRole('heading', { name: 'Draft a reading guide' })
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Capsule saved.')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps input and focuses the field when the server rejects a save', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    fetch.mockResolvedValueOnce(
      json(
        {
          error: 'Invalid capsule.',
          details: [
            { field: 'prompt_title', message: 'Please choose a clearer title.' }
          ]
        },
        400
      )
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your changes have not been saved'
    )
    expect(screen.getByText('Please choose a clearer title.')).toBeVisible()
    expect(screen.getByLabelText(/Prompt title/)).toHaveValue(
      'Draft a reading guide'
    )
    expect(screen.getByLabelText(/Prompt text/)).toHaveValue(
      'Suggest a reading guide for a fictional book club.'
    )
    expect(screen.getByLabelText(/Prompt title/)).toHaveFocus()
    expect(screen.getByLabelText(/Prompt title/)).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('keeps form values after a network failure', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    await user.type(
      screen.getByLabelText('Notes'),
      'Fictional verification note'
    )
    fetch.mockRejectedValueOnce(new TypeError('Network unavailable'))
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach AI Capsule'
    )
    expect(screen.getByLabelText('Notes')).toHaveValue(
      'Fictional verification note'
    )
    expect(screen.getByRole('button', { name: 'Save capsule' })).toBeEnabled()
  })

  it('validates evidence URLs and nonblank text before sending a request', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    await user.clear(screen.getByLabelText(/Prompt title/))
    await user.type(screen.getByLabelText(/Prompt title/), '   ')
    await user.type(
      screen.getByLabelText('Screenshot evidence URL'),
      'javascript:alert(1)'
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(screen.getByText('Enter a nonblank value.')).toBeVisible()
    expect(
      screen.getByText('Use a full HTTP or HTTPS URL without credentials.')
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
    await user.type(
      screen.getByLabelText(/Prompt title/),
      'A clearer fictional title'
    )
    expect(screen.getByLabelText(/Prompt title/)).toHaveFocus()
  })

  it('sends all writable values on edit, retaining optional text and false booleans', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Edit capsule' }))
    expect(screen.getByLabelText(/Reviewed/)).not.toBeChecked()
    expect(screen.getByLabelText(/Improved/)).not.toBeChecked()
    expect(screen.getByLabelText('Notes')).toHaveValue(example.notes)
    await user.clear(screen.getByLabelText(/Prompt title/))
    await user.type(
      screen.getByLabelText(/Prompt title/),
      'Compare accessible catalogue layouts'
    )
    fetch.mockResolvedValueOnce(
      json({
        capsule: {
          ...example,
          prompt_title: 'Compare accessible catalogue layouts'
        }
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', {
        name: 'Compare accessible catalogue layouts'
      })
    ).toBeVisible()
    const [path, options] = fetch.mock.calls[1]
    expect(path).toBe('/api/capsules/7')
    expect(options.method).toBe('PUT')
    const writable = Object.fromEntries(
      Object.entries(example).filter(
        ([name]) => !['id', 'user_id', 'created_at'].includes(name)
      )
    )
    expect(JSON.parse(options.body)).toEqual({
      ...writable,
      prompt_title: 'Compare accessible catalogue layouts'
    })
  })

  it('cancels editing without sending a mutation', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Edit capsule' }))
    await user.clear(screen.getByLabelText('Notes'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('heading', { name: example.prompt_title })
    ).toBeVisible()
    expect(screen.getByText(example.notes)).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('names the record before deletion, supports cancellation and handles an empty 204', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Delete capsule' }))
    expect(
      screen.getByRole('heading', { name: `Delete “${example.prompt_title}”?` })
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Keep capsule' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Delete capsule' }))
    const parseJson = vi.fn()
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: parseJson })
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(
      await screen.findByText('A space for your next insight')
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Capsule deleted.')
    expect(fetch.mock.calls[1][1].method).toBe('DELETE')
    expect(fetch.mock.calls[1][1].body).toBeUndefined()
    expect(parseJson).not.toHaveBeenCalled()
  })

  it('retains the record and presents retry feedback when deletion fails', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Delete capsule' }))
    fetch.mockResolvedValueOnce(
      json({ error: 'Could not delete the capsule.' }, 500)
    )
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete the capsule.'
    )
    expect(
      screen.getByRole('button', { name: 'Delete permanently' })
    ).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Keep capsule' }))
    expect(
      screen.getByRole('heading', { name: example.prompt_title })
    ).toBeVisible()
  })

  it('renders prompts as text and does not link unsafe evidence URLs', async () => {
    const malicious = {
      ...example,
      prompt_text: '<img src=x onerror=alert(1)>',
      screenshot_url: 'javascript:alert(1)'
    }
    const { user } = start([malicious])
    await openExample(user)
    expect(screen.getByText(malicious.prompt_text)).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /View screenshot/ })
    ).not.toBeInTheDocument()
  })

  it('provides safe links and labelled timestamp metadata in the detail view', async () => {
    const { user } = start([example])
    await openExample(user)
    const link = screen.getByRole('link', { name: /View screenshot/ })
    expect(link).toHaveAttribute('href', example.screenshot_url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('time')).toHaveAttribute(
      'dateTime',
      example.created_at
    )
  })

  it('uses keyboard navigation for opening a record', async () => {
    const { user } = start([example])
    const record = await screen.findByRole('button', {
      name: /Compare catalogue layouts/
    })
    record.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('heading', { name: example.prompt_title })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit capsule' })).toBeEnabled()
  })
})

describe('session rejection', () => {
  it('removes protected content when the capsule API returns 401', async () => {
    window.history.replaceState({}, '', '/dashboard')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ user: { id: '101', login: 'fictional-test-account' } })
        )
        .mockResolvedValueOnce(json({ error: 'Authentication required.' }, 401))
    )
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' })
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has ended'
    )
    expect(screen.queryByText('Your capsules')).not.toBeInTheDocument()
    expect(screen.queryByText('fictional-test-account')).not.toBeInTheDocument()
  })

  it('removes an open form if saving rejects an expired session', async () => {
    window.history.replaceState({}, '', '/dashboard')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ user: { id: '101', login: 'fictional-test-account' } })
      )
      .mockResolvedValueOnce(json({ capsules: [] }))
      .mockResolvedValueOnce(json({ error: 'Authentication required.' }, 401))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' })
    ).toBeVisible()
    expect(screen.queryByLabelText(/Prompt text/)).not.toBeInTheDocument()
  })

  it('handles 204 without requesting JSON', async () => {
    const parseJson = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: parseJson })
    )
    await expect(
      apiRequest('/api/auth/logout', { method: 'POST' })
    ).resolves.toBeNull()
    expect(parseJson).not.toHaveBeenCalled()
  })
})
