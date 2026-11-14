import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const stateSeconds = 10 * 60;
export const stateCookie = {
  httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/github',
};

export function createOAuthStates(now = Date.now) {
  const pending = new Map();

  function create() {
    for (const [state, request] of pending) {
      if (request.expiresAt <= now()) pending.delete(state);
    }
    if (pending.size >= 1000) throw new Error('Too many pending sign-ins.');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    pending.set(state, { verifier, expiresAt: now() + stateSeconds * 1000 });
    return { state, challenge: createHash('sha256').update(verifier).digest('base64url') };
  }

  function consume(state, cookie) {
    if (typeof state !== 'string' || typeof cookie !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookie) ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) return null;
    const request = pending.get(state);
    pending.delete(state);
    if (!request || request.expiresAt <= now()) return null;
    return request.verifier;
  }

  return { create, consume };
}
