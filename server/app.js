import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { readAuthConfig } from './auth-config.js';
import { createGitHubAuth } from './github-auth.js';
import { createCapsuleApi } from './capsule-api.js';
import { createCapsuleStorage } from './capsule-storage.js';

const clientDirectory = fileURLToPath(new URL('../client/dist/', import.meta.url));

export function createApp({ env = process.env, fetchProvider, states, database } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  let auth;
  let authConfig;
  try {
    authConfig = readAuthConfig(env);
    auth = createGitHubAuth(authConfig, { fetchProvider, states });
  } catch (error) {
    // Health and storage remain available while OAuth credentials are being set up.
    app.use('/api/auth', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(503).json({ error: error.message });
    });
  }
  if (auth) app.use('/api/auth', auth.router);
  app.use('/api/capsules', createCapsuleApi({
    storage: createCapsuleStorage(database),
    requireUser: auth?.requireUser || ((req, res) => res.status(401).json({ error: 'Authentication required.' })),
    appOrigin: authConfig?.appOrigin,
  }));
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
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof URIError) return res.status(400).json({ error: 'Invalid request path.' });
    if (['entity.parse.failed', 'entity.too.large',
      'encoding.unsupported', 'charset.unsupported', 'request.size.invalid'].includes(error.type)) {
      return res.status(400).json({ error: 'Invalid JSON request.' });
    }
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  return app;
}
