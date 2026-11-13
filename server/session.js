import jwt from 'jsonwebtoken';

export const sessionSeconds = 60 * 60;
export const sessionCookie = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

function validIdentity(id, login) {
  return typeof id === 'string' && /^[1-9]\d*$/.test(id) &&
    typeof login === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login);
}

export function createSessions(config) {
  function issue(user) {
    if (!validIdentity(user.id, user.login)) throw new TypeError('Invalid GitHub identity.');
    return jwt.sign({ login: user.login }, config.jwtSecret, {
      algorithm: 'HS256', subject: user.id, issuer: config.appOrigin,
      audience: 'ai-capsule', expiresIn: sessionSeconds,
    });
  }

  function verify(token) {
    if (typeof token !== 'string') throw new Error('Missing session');
    const claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'], issuer: config.appOrigin, audience: 'ai-capsule',
      maxAge: sessionSeconds,
    });
    if (!validIdentity(claims.sub, claims.login) || !Number.isInteger(claims.exp) ||
        !Number.isInteger(claims.iat) || claims.iat > Math.floor(Date.now() / 1000)) {
      throw new Error('Invalid session claims');
    }
    return { id: claims.sub, login: claims.login };
  }

  function requireUser(req, res, next) {
    try {
      req.user = verify(req.cookies?.token);
    } catch {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    next();
  }

  return { issue, verify, requireUser };
}
