import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status })

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('overview session navigation', () => {
  it('keeps the public overview and shows sign-in after a 401 session check', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response({ error: 'Authentication required.' }, 401))
    )
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /Good prompts deserve/ })
    ).toBeVisible()
    expect(
      await screen.findByRole('link', { name: /Sign in/ })
    ).toHaveAttribute('href', '/login')
    expect(
      screen.getByRole('link', { name: /Open your workspace/ })
    ).toHaveAttribute('href', '/dashboard')
  })

  it('shows the signed-in identity and links directly to the workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ user: { id: '76832192', login: 'RLirri' } })
        )
    )
    render(<App />)

    expect(await screen.findByText('RLirri')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Open your workspace/ })
    ).toHaveAttribute('href', '/dashboard')
    expect(
      screen.queryByRole('link', { name: /Continue with GitHub/ })
    ).not.toBeInTheDocument()
  })

  it('keeps overview content available without showing sign-in while loading', async () => {
    let resolveSession
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSession = resolve
          })
      )
    )
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /Good prompts deserve/ })
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Checking session')
    expect(screen.queryByRole('link', { name: /Sign in/ })).toBeNull()

    resolveSession(response({ error: 'Authentication required.' }, 401))
    expect(await screen.findByRole('link', { name: /Sign in/ })).toBeVisible()
  })

  it('offers a retry after a session-check failure and distinguishes it from 401', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(
        response({ error: 'Authentication required.' }, 401)
      )
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Session check unavailable.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /Sign in/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: /Sign in/ })).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('updates the shared overview header after logout', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ user: { id: '76832192', login: 'RLirri' } })
      )
      .mockResolvedValueOnce(response({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('link', { name: /Sign in/ })).toBeVisible()
    expect(screen.queryByText('RLirri')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Good prompts deserve/ })
    ).toBeVisible()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch.mock.calls[1][1].method).toBe('POST')
    expect(fetch.mock.calls[1][0]).toBe('/api/auth/logout')
  })
})
