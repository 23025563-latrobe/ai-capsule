import { Router } from 'express';
import { createOAuthStates, stateCookie, stateSeconds } from './oauth-state.js';
import { createSessions, sessionCookie, sessionSeconds } from './session.js';

export function createGitHubAuth(config, { fetchProvider = fetch, states = createOAuthStates() } = {}) {
  const router = Router();
  const sessions = createSessions(config);

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  router.get('/github', (req, res) => {
    try {
      const { state, challenge } = states.create();
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: config.clientId, redirect_uri: config.callbackUrl, state,
        scope: '', code_challenge: challenge, code_challenge_method: 'S256',
      }).toString();
      res.cookie('oauth_state', state, { ...stateCookie, maxAge: stateSeconds * 1000 });
      res.redirect(url.href);
    } catch {
      res.status(503).json({ error: 'Sign-in is busy. Please try again shortly.' });
    }
  });

  router.get('/github/callback', async (req, res) => {
    res.clearCookie('oauth_state', stateCookie);
    const verifier = states.consume(req.query.state, req.cookies?.oauth_state);
    if (!verifier) return res.redirect('/login?error=invalid_state');
    if (req.query.error) {
      const error = req.query.error === 'access_denied' ? 'access_denied' : 'provider_failure';
      return res.redirect(`/login?error=${error}`);
    }
    if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 512) {
      return res.redirect('/login?error=invalid_callback');
    }

    try {
      const tokenResponse = await fetchProvider('https://github.com/login/oauth/access_token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId, client_secret: config.clientSecret,
          code: req.query.code, redirect_uri: config.callbackUrl, code_verifier: verifier,
        }),
      });
      if (!tokenResponse.ok) throw new Error('Token exchange failed');
      const token = await tokenResponse.json();
      if (token.error || typeof token.access_token !== 'string' || !token.access_token ||
          token.token_type?.toLowerCase() !== 'bearer') throw new Error('Invalid token response');

      const userResponse = await fetchProvider('https://api.github.com/user', {
        redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'AI-Capsule',
        },
      });
      if (!userResponse.ok) throw new Error('Identity lookup failed');
      const user = await userResponse.json();
      if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('Invalid GitHub user ID');
      const applicationToken = sessions.issue({ id: String(user.id), login: user.login });
      res.cookie('token', applicationToken, { ...sessionCookie, maxAge: sessionSeconds * 1000 });
      res.redirect('/dashboard');
    } catch {
      res.redirect('/login?error=provider_failure');
    }
  });

  router.get('/session', sessions.requireUser, (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/logout', (req, res) => {
    // An exact Origin check protects this cookie-authenticated action from CSRF.
    if (req.get('origin') !== config.appOrigin) {
      return res.status(403).json({ error: 'A same-origin request is required.' });
    }
    res.clearCookie('token', sessionCookie);
    res.sendStatus(204);
  });

  return { router, verifySession: sessions.verify };
}
