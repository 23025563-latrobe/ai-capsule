import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { readAuthConfig } from './auth-config.js';
import { createOAuthStates } from './oauth-state.js';
import { createSessions, sessionSeconds } from './session.js';

const env = {
  PUBLIC_APP_URL: 'https://localhost:5173',
  GITHUB_CALLBACK_URL: 'https://localhost:5173/api/auth/github/callback',
  GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-provider-secret',
  JWT_SECRET: 'a-test-only-secret-with-at-least-32-bytes',
};
const config = readAuthConfig(env);

async function fixture(t, options = {}) {
  const calls = [];
  const fetchProvider = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/access_token')) {
      return Response.json({ access_token: 'mock-provider-token', token_type: 'bearer' });
    }
    return Response.json({ id: 12345, login: 'capsule-user', email: 'private@example.com' });
  };
  const app = createApp({ env, fetchProvider, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
  async function begin() {
    const response = await request('/api/auth/github');
    assert.equal(response.status, 302);
    return {
      response,
      url: new URL(response.headers.get('location')),
      cookie: response.headers.getSetCookie()[0].split(';')[0],
    };
  }
  return { request, begin, calls };
}

function tokenCookie(response) {
  return response.headers.getSetCookie().find((value) => value.startsWith('token='));
}

function assertSecureCookie(cookie, path) {
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.ok(cookie.includes(`; Path=${path};`));
  assert.doesNotMatch(cookie, /Domain=/);
}

test('configuration requires secrets and matching public HTTPS URLs', () => {
  assert.throws(() => readAuthConfig({}), /configuration missing/);
  assert.throws(() => readAuthConfig({ ...env, JWT_SECRET: 'short' }), /32 bytes/);
  for (const url of ['http://localhost:5173', 'https://localhost:5173/path', 'https://user:pass@localhost:5173']) {
    assert.throws(() => readAuthConfig({ ...env, PUBLIC_APP_URL: url }), /HTTPS origin/);
  }
  assert.throws(() => readAuthConfig({ ...env, GITHUB_CALLBACK_URL: 'https://evil.example/callback' }), /GITHUB_CALLBACK_URL/);
});

test('health remains public and missing OAuth configuration fails clearly', async (t) => {
  const { request } = await fixture(t, { env: {} });
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  for (const path of ['/api/auth/github', '/api/auth/session']) {
    const response = await request(path);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /configuration missing/);
  }
  assert.equal((await request('/api/capsules')).status, 404);
});

test('OAuth initiation creates random state, PKCE and a short-lived secure cookie', async (t) => {
  const { begin } = await fixture(t);
  const first = await begin();
  const second = await begin();
  assert.equal(first.url.origin, 'https://github.com');
  assert.equal(first.url.pathname, '/login/oauth/authorize');
  assert.equal(first.url.searchParams.get('client_id'), env.GITHUB_CLIENT_ID);
  assert.equal(first.url.searchParams.get('redirect_uri'), env.GITHUB_CALLBACK_URL);
  assert.equal(first.url.searchParams.get('scope'), '');
  assert.equal(first.url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(first.url.searchParams.get('state'), /^[\w-]{43}$/);
  assert.notEqual(first.url.searchParams.get('state'), second.url.searchParams.get('state'));
  const cookie = first.response.headers.getSetCookie()[0];
  assertSecureCookie(cookie, '/api/auth/github');
  assert.match(cookie, /Max-Age=600/);
  assert.equal(first.response.headers.get('cache-control'), 'no-store');
});

test('state rejects absent, mismatched, malformed, expired and reused requests', async (t) => {
  let time = Date.now();
  const { request, begin, calls } = await fixture(t, { states: createOAuthStates(() => time) });
  const first = await begin();
  const state = first.url.searchParams.get('state');
  for (const [query, cookie] of [
    ['code=abc', first.cookie], [`state=${state}&code=abc`, ''],
    [`state=${'x'.repeat(43)}&code=abc`, first.cookie],
    ['state=bad&state=duplicate&code=abc', first.cookie],
  ]) {
    const response = await request(`/api/auth/github/callback?${query}`, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get('location'), '/login?error=invalid_state');
    assert.equal(tokenCookie(response), undefined);
  }
  time += 600_001;
  const expired = await request(`/api/auth/github/callback?state=${state}&code=abc`, { headers: { Cookie: first.cookie } });
  assert.equal(expired.headers.get('location'), '/login?error=invalid_state');
  assert.equal(calls.length, 0);
  const second = await begin();
  const callback = `/api/auth/github/callback?state=${second.url.searchParams.get('state')}&error=access_denied`;
  const denied = await request(callback, { headers: { Cookie: second.cookie } });
  assert.equal(denied.headers.get('location'), '/login?error=access_denied');
  const replay = await request(callback, { headers: { Cookie: second.cookie } });
  assert.equal(replay.headers.get('location'), '/login?error=invalid_state');
  assert.equal(calls.length, 0);
  const third = await begin();
  const providerError = await request(`/api/auth/github/callback?state=${third.url.searchParams.get('state')}&error=server_error`, {
    headers: { Cookie: third.cookie },
  });
  assert.equal(providerError.headers.get('location'), '/login?error=provider_failure');
  assert.equal(calls.length, 0);
});

test('mocked OAuth issues an application JWT using the authenticated GitHub ID', async (t) => {
  const { request, begin, calls } = await fixture(t);
  const { url, cookie } = await begin();
  const callback = `/api/auth/github/callback?state=${url.searchParams.get('state')}&code=abc&user_id=attacker&next=https://evil.example`;
  const response = await request(callback, { headers: { Cookie: cookie } });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/dashboard');
  const issuedCookie = tokenCookie(response);
  assertSecureCookie(issuedCookie, '/');
  assert.match(issuedCookie, /Max-Age=3600/);
  assert.match(issuedCookie, /Expires=/);
  const token = issuedCookie.split(';')[0].slice('token='.length);
  assert.notEqual(token, 'mock-provider-token');
  const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: config.appOrigin, audience: 'ai-capsule' });
  assert.equal(claims.sub, '12345');
  assert.equal(claims.exp - claims.iat, sessionSeconds);
  assert.equal(claims.login, 'capsule-user');
  assert.equal(calls[0].url, 'https://github.com/login/oauth/access_token');
  assert.equal(calls[0].init.body.get('client_secret'), env.GITHUB_CLIENT_SECRET);
  assert.equal(calls[0].init.body.get('redirect_uri'), env.GITHUB_CALLBACK_URL);
  const verifier = calls[0].init.body.get('code_verifier');
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(calls[1].url, 'https://api.github.com/user');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer mock-provider-token');
  assert.doesNotMatch(await response.text(), /mock-provider-token|private@example.com/);
  const session = await request('/api/auth/session', { headers: { Cookie: `token=${token}` } });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { user: { id: '12345', login: 'capsule-user' } });
  assert.equal(session.headers.get('cache-control'), 'no-store');
  assert.equal(session.headers.getSetCookie().length, 0);
  const replay = await request(callback, { headers: { Cookie: cookie } });
  assert.equal(replay.headers.get('location'), '/login?error=invalid_state');
  assert.equal(calls.length, 2);
});

test('invalid callbacks and mocked provider failures never issue a session', async (t) => {
  const scenarios = [
    async () => { throw new Error('network failure containing a provider secret'); },
    async () => Response.json({ error: 'bad_verification_code' }),
    async () => Response.json({ access_token: 'token', token_type: 'bearer' }, { status: 500 }),
    async () => new Response('not json'),
    async () => Response.json({ access_token: '', token_type: 'bearer' }),
    async (url) => url.endsWith('/access_token')
      ? Response.json({ access_token: 'token', token_type: 'bearer' })
      : Response.json({ message: 'Unauthorized' }, { status: 401 }),
    async (url) => url.endsWith('/access_token')
      ? Response.json({ access_token: 'token', token_type: 'bearer' })
      : Response.json({ id: '12345', login: 'wrong-id-type' }),
    async (url) => url.endsWith('/access_token')
      ? Response.json({ access_token: 'token', token_type: 'bearer' })
      : Response.json({ id: 12345, login: '' }),
  ];
  for (const fetchProvider of scenarios) {
    const { request, begin } = await fixture(t, { fetchProvider });
    const { url, cookie } = await begin();
    const response = await request(`/api/auth/github/callback?state=${url.searchParams.get('state')}&code=abc`, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get('location'), '/login?error=provider_failure');
    assert.equal(tokenCookie(response), undefined);
    assert.doesNotMatch(await response.text(), /provider secret/);
    assertSecureCookie(response.headers.getSetCookie()[0], '/api/auth/github');
    assert.match(response.headers.getSetCookie()[0], /Expires=Thu, 01 Jan 1970/);
  }
  const { request, begin, calls } = await fixture(t);
  const { url, cookie } = await begin();
  const invalid = await request(`/api/auth/github/callback?state=${url.searchParams.get('state')}`, { headers: { Cookie: cookie } });
  assert.equal(invalid.headers.get('location'), '/login?error=invalid_callback');
  assert.equal(calls.length, 0);
});

test('protected sessions reject missing, malformed, expired, forged and invalid-claim JWTs', async (t) => {
  const { request } = await fixture(t);
  const options = { algorithm: 'HS256', issuer: config.appOrigin, audience: 'ai-capsule', expiresIn: 3600 };
  const payload = { sub: '12345', login: 'capsule-user' };
  const tokens = [
    '', 'not.a.jwt', '%E0%A4%A',
    jwt.sign(payload, 'a-different-secret', options),
    jwt.sign(payload, env.JWT_SECRET, { ...options, expiresIn: -1 }),
    jwt.sign(payload, env.JWT_SECRET, { ...options, algorithm: 'HS384' }),
    jwt.sign(payload, env.JWT_SECRET, { ...options, issuer: 'other-app' }),
    jwt.sign(payload, env.JWT_SECRET, { ...options, audience: 'other-audience' }),
    jwt.sign({ ...payload, nbf: Math.floor(Date.now() / 1000) + 100 }, env.JWT_SECRET, options),
    jwt.sign({ ...payload, iat: Math.floor(Date.now() / 1000) + 100 }, env.JWT_SECRET, options),
    jwt.sign({ ...payload, sub: 'attacker' }, env.JWT_SECRET, options),
    jwt.sign({ sub: '12345' }, env.JWT_SECRET, options),
    jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', issuer: config.appOrigin, audience: 'ai-capsule' }),
    jwt.sign(payload, env.JWT_SECRET, { ...options, noTimestamp: true }),
  ];
  for (const token of tokens) {
    const response = await request('/api/auth/session', { headers: token ? { Cookie: `token=${token}` } : {} });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Authentication required.' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const valid = createSessions(config).issue({ id: '12345', login: 'capsule-user' });
  assert.equal((await request('/api/auth/session', { headers: { Cookie: `token=${valid}` } })).status, 200);
  assert.equal((await request('/api/health')).status, 200);
  const dashboard = await request('/dashboard');
  assert.equal(dashboard.status, 302);
  assert.equal(dashboard.headers.get('location'), '/login');
});

test('logout requires same-origin POST and clears the matching secure session cookie', async (t) => {
  const { request } = await fixture(t);
  for (const origin of [undefined, 'https://evil.example', 'null', 'http://localhost:5173']) {
    const response = await request('/api/auth/logout', {
      method: 'POST', headers: origin ? { Origin: origin } : {},
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  assert.equal((await request('/api/auth/logout')).status, 404);
  const response = await request('/api/auth/logout', { method: 'POST', headers: { Origin: config.appOrigin } });
  assert.equal(response.status, 204);
  const cookie = tokenCookie(response);
  assertSecureCookie(cookie, '/');
  assert.match(cookie, /^token=;/);
  assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
