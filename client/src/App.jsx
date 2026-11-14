import { useEffect, useState } from 'react'
import './App.css'

const loginErrors = {
  invalid_state: 'This sign-in request expired or could not be verified. Please try again.',
  invalid_callback: 'GitHub did not return a valid sign-in response. Please try again.',
  access_denied: 'GitHub authorization was cancelled. You can try again when ready.',
  provider_failure: 'GitHub sign-in is unavailable right now. Please try again.',
  not_configured: 'GitHub sign-in has not been configured on this server.',
}

function App() {
  const path = window.location.pathname
  const [session, setSession] = useState({ loading: true, user: null, error: '' })
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    if (path !== '/login' && path !== '/dashboard') return
    const controller = new AbortController()
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin', signal: controller.signal,
        })
        if (response.status === 401) {
          if (path === '/dashboard') window.location.replace('/login')
          setSession({ loading: false, user: null, error: '' })
          return
        }
        if (!response.ok) throw new Error('Sign-in is unavailable. Check the server configuration or try again later.')
        const { user } = await response.json()
        if (path === '/login') window.location.replace('/dashboard')
        setSession({ loading: false, user, error: '' })
      } catch (error) {
        if (error.name !== 'AbortError') {
          setSession({ loading: false, user: null, error: error.message })
        }
      }
    }
    checkSession()
    return () => controller.abort()
  }, [path])

  async function logout() {
    setLoggingOut(true)
    setLogoutError('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Could not sign out. Please try again.')
      window.location.replace('/login')
    } catch (error) {
      setLogoutError(error.message)
      setLoggingOut(false)
    }
  }

  let content
  if (path === '/') {
    content = <>
      <h1>Keep your AI learning in one place</h1>
      <p>AI Capsule helps you record prompts, reflect on responses and track improvements across your projects.</p>
      <a className="button" href="/login">Sign in to AI Capsule</a>
    </>
  } else if (path === '/login' || path === '/dashboard') {
    if (session.loading) content = <p role="status">Checking your session…</p>
    else if (session.error) content = <>
      <h1>Sign-in unavailable</h1>
      <p role="alert">{session.error}</p>
      <a href="/login">Try again</a>
    </>
    else if (path === '/dashboard' && session.user) content = <>
      <h1>Your dashboard</h1>
      <p>Signed in as <strong>{session.user.login}</strong>.</p>
      <p>Your capsule workspace will be available in a later update.</p>
      {logoutError && <p role="alert">{logoutError}</p>}
      <button onClick={logout} disabled={loggingOut}>{loggingOut ? 'Signing out…' : 'Sign out'}</button>
    </>
    else if (path === '/login') {
      const errorCode = new URLSearchParams(window.location.search).get('error')
      const errorMessage = Object.hasOwn(loginErrors, errorCode) ? loginErrors[errorCode] : ''
      content = <>
        <h1>Sign in</h1>
        <p>Use your GitHub account to access your AI Capsule workspace.</p>
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <a className="button" href="/api/auth/github">Continue with GitHub</a>
      </>
    } else content = <p role="status">Returning to sign in…</p>
  } else content = <><h1>Page not found</h1><a href="/">Return home</a></>

  return <>
    <header><a href="/" className="brand">AI Capsule</a><nav aria-label="Main"><a href="/dashboard">Dashboard</a></nav></header>
    <main>{content}</main>
  </>
}

export default App
