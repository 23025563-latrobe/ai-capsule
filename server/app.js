import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { readAuthConfig } from './auth-config.js';
import { createGitHubAuth } from './github-auth.js';

const clientDirectory = fileURLToPath(new URL('../client/dist/', import.meta.url));

export function createApp({ env = process.env, fetchProvider, states } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  let auth;
  try {
    auth = createGitHubAuth(readAuthConfig(env), { fetchProvider, states });
  } catch (error) {
    // Health and storage remain available while OAuth credentials are being set up.
    app.use('/api/auth', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(503).json({ error: error.message });
    });
  }
  if (auth) app.use('/api/auth', auth.router);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  const sendPage = (req, res) => res.sendFile('index.html', { root: clientDirectory });
  app.get('/dashboard', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!auth) return res.redirect('/login?error=not_configured');
    try {
      req.user = auth.verifySession(req.cookies?.token);
    } catch {
      return res.redirect('/login');
    }
    next();
  }, sendPage);
  app.use(express.static(clientDirectory, { index: false }));
  app.get(['/', '/login'], sendPage);
  return app;
}
