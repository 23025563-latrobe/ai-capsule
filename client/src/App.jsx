import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from './api'
import CapsuleWorkspace from './components/CapsuleWorkspace'
import './App.css'

const loginErrors = {
  invalid_state:
    'This sign-in request expired or could not be verified. Please try again.',
  invalid_callback:
    'GitHub did not return a valid sign-in response. Please try again.',
  access_denied:
    'GitHub authorization was cancelled. You can try again when ready.',
  provider_failure:
    'GitHub sign-in is unavailable right now. Please try again.',
  not_configured: 'GitHub sign-in has not been configured on this server.',
  session_expired: 'Your session has ended. Sign in again to continue.'
}

function App() {
  const path = window.location.pathname
  const [session, setSession] = useState({
    loading: true,
    user: null,
    error: '',
    expired: false
  })
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const expireSession = useCallback(() => {
    setSession({ loading: false, user: null, error: '', expired: true })
  }, [])

  const retrySession = useCallback(() => {
    setSession({ loading: true, user: null, error: '', expired: false })
    setSessionAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    if (path !== '/' && path !== '/login' && path !== '/dashboard') return
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 10000)
    apiRequest('/api/auth/session', { signal: controller.signal })
      .then(({ user }) => {
        if (path === '/login') window.location.replace('/dashboard')
        setSession({ loading: false, user, error: '', expired: false })
      })
      .catch((error) => {
        if (error.name === 'AbortError' && !timedOut) return
        if (error.status === 401) {
          setSession({
            loading: false,
            user: null,
            error: '',
            expired: path === '/dashboard'
          })
        } else
          setSession({
            loading: false,
            user: null,
            error: timedOut
              ? 'The session check timed out. Please try again.'
              : error.message,
            expired: false
          })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [path, sessionAttempt])

  async function logout() {
    setLoggingOut(true)
    setLogoutError('')
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
      setSession({ loading: false, user: null, error: '', expired: false })
      setLoggingOut(false)
      if (path !== '/') window.location.replace('/login')
    } catch (error) {
      if (error.status === 401) expireSession()
      else setLogoutError(error.message)
      setLoggingOut(false)
    }
  }

  let content
  if (path === '/')
    content = (
      <div className="public-page">
        <p className="eyebrow">A thoughtful record of working with AI</p>
        <h1>
          Good prompts deserve
          <br />a record.
        </h1>
        <p className="public-intro">
          Keep your questions, capture the useful responses and reflect on what
          you would do differently. One capsule at a time.
        </p>
        <a className="button" href="/dashboard">
          Open your workspace <span aria-hidden="true">→</span>
        </a>
        <div className="principles">
          <div>
            <span>01</span>
            <h2>Record</h2>
            <p>Keep the prompt and its context together.</p>
          </div>
          <div>
            <span>02</span>
            <h2>Reflect</h2>
            <p>Note what helped and what needed a closer look.</p>
          </div>
          <div>
            <span>03</span>
            <h2>Refine</h2>
            <p>Build on earlier thinking with a clearer next version.</p>
          </div>
        </div>
      </div>
    )
  else if (path === '/dashboard' || path === '/login') {
    if (session.loading)
      content = (
        <section className="public-page" role="status">
          <p className="eyebrow">AI Capsule</p>
          <h1>Opening your workspace…</h1>
          <p>Checking your session securely.</p>
        </section>
      )
    else if (session.error)
      content = (
        <section className="public-page">
          <h1>We couldn’t connect</h1>
          <p className="notice error" role="alert">
            {session.error}
          </p>
        </section>
      )
    else if (session.expired)
      content = (
        <section className="public-page">
          <p className="eyebrow">Session ended</p>
          <h1>Welcome back.</h1>
          <p role="alert">Your session has ended. Sign in again to continue.</p>
          <a className="button" href="/login">
            Return to sign in
          </a>
        </section>
      )
    else if (path === '/dashboard' && session.user)
      content = <CapsuleWorkspace onSessionExpired={expireSession} />
    else {
      const errorCode = new URLSearchParams(window.location.search).get('error')
      const errorMessage = Object.hasOwn(loginErrors, errorCode)
        ? loginErrors[errorCode]
        : ''
      content = (
        <section className="public-page login-page">
          <h1>Your AI prompts, in one place.</h1>
          <p className="public-intro">
            Sign in with GitHub to save prompts, review responses and keep project
            notes.
          </p>
          {errorMessage && (
            <p className="notice error" role="alert">
              {errorMessage}
            </p>
          )}
          <a className="button" href="/api/auth/github">
            Continue with GitHub <span aria-hidden="true">↗</span>
          </a>
          <p className="small muted">
            Your capsules are visible only to your signed-in account.
          </p>
        </section>
      )
    }
  } else
    content = (
      <section className="public-page">
        <h1>Page not found</h1>
        <a href="/">Return home</a>
      </section>
    )

  return (
    <div
      className={
        path === '/dashboard' && session.user
          ? 'app-shell'
          : 'app-shell public-shell'
      }
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            AI Capsule<small>Record. Reflect. Refine.</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a
            href="/dashboard"
            aria-current={path === '/dashboard' ? 'page' : undefined}
          >
            <span aria-hidden="true">▤</span> Capsule workspace
          </a>
          <a href="/" aria-current={path === '/' ? 'page' : undefined}>
            <span aria-hidden="true">⌂</span> Overview
          </a>
        </nav>
        <div className="sidebar-footer">
          AI Capsule<span>Personal learning archive</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span className="topbar-label">
            {path === '/dashboard'
              ? 'Workspace / Capsules'
              : 'AI Capsule / Welcome'}
          </span>
          {session.user ? (
            <div className="account">
              <span className="avatar" aria-hidden="true">
                {session.user.login.slice(0, 1).toUpperCase()}
              </span>
              <span className="account-name">
                Signed in as <strong>{session.user.login}</strong>
              </span>
              <button className="quiet" onClick={logout} disabled={loggingOut}>
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          ) : session.loading ? (
            <span className="session-check" role="status">
              Checking session…
            </span>
          ) : session.error ? (
            <div className="session-check-error">
              <span role="status">Session check unavailable.</span>
              <button className="quiet" onClick={retrySession}>
                Retry
              </button>
            </div>
          ) : (
            <a className="quiet" href="/login">
              Sign in <span aria-hidden="true">→</span>
            </a>
          )}
        </header>
        <main id="main-content">
          {logoutError && (
            <p className="notice error" role="alert">
              {logoutError}
            </p>
          )}
          {content}
        </main>
      </div>
    </div>
  )
}

export default App
