import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { openDatabase } from './database.js';
import { createCapsuleStorage } from './capsule-storage.js';
import { createSessions } from './session.js';
import { readAuthConfig } from './auth-config.js';

const required = { project_name: 'Assessment', prompt_title: 'SQL design', prompt_text: 'Explain relational data' };

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ai-capsule-api-'));
  const database = openDatabase(join(directory, 'capsules.sqlite'));
  const env = {
    PUBLIC_APP_URL: 'https://localhost:5173',
    GITHUB_CALLBACK_URL: 'https://localhost:5173/api/auth/github/callback',
    GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-only-provider-secret',
    JWT_SECRET: randomBytes(32).toString('hex'),
  };
  const config = readAuthConfig(env);
  const sessions = createSessions(config);
  const alice = sessions.issue({ id: '101', login: 'alice' });
  const bob = sessions.issue({ id: '202', login: 'bob' });
  const sqlite = createCapsuleStorage(database);
  const storage = Object.fromEntries(Object.entries(sqlite).map(([name, operation]) =>
    [name, async (...args) => operation(...args)]));
  const app = createApp({ env, storage: { ...storage, ...overrides } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  function request(path = '/api/capsules', { method = 'GET', token = alice,
    body, rawBody, origin = config.appOrigin, headers = {} } = {}) {
    return fetch(base + path, {
      method,
      headers: {
        ...(token ? { Cookie: `token=${token}` } : {}),
        ...(origin ? { Origin: origin } : {}),
        ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: 'manual',
    });
  }
  async function create(fields = required, token = alice) {
    const response = await request('/api/capsules', { method: 'POST', token, body: fields });
    assert.equal(response.status, 201);
    return (await response.json()).capsule;
  }
  return { request, create, alice, bob, env, config, database };
}

test('every capsule route authenticates before parsing or checking mutation origin', async (t) => {
  const { request, env, config } = await fixture(t);
  const payload = { sub: '101', login: 'alice' };
  const options = { algorithm: 'HS256', issuer: config.appOrigin, audience: 'ai-capsule', expiresIn: 3600 };
  const tokens = [
    null, 'fake-token-123', 'not.a.jwt',
    jwt.sign(payload, 'different-test-secret', options),
    jwt.sign(payload, env.JWT_SECRET, { ...options, expiresIn: -1 }),
    jwt.sign(payload, env.JWT_SECRET, { ...options, algorithm: 'HS384' }),
  ];
  for (const [method, path] of [
    ['GET', '/api/capsules'], ['POST', '/api/capsules'],
    ['PUT', '/api/capsules/1'], ['DELETE', '/api/capsules/1'],
  ]) {
    for (const token of tokens) {
      const response = await request(path, {
        method, token, origin: null, ...(method === 'POST' || method === 'PUT' ? { rawBody: '{broken' } : {}),
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Authentication required.' });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  const health = await request('/api/health', { token: null });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
});

test('authenticated HTTP CRUD preserves all fields, SQL-like text and managed metadata', async (t) => {
  const { request, create, database } = await fixture(t);
  const fields = {
    project_name: "Alice's assessment", prompt_title: "'); DROP TABLE capsules; --",
    prompt_version: '2.1', prompt_text: 'SELECT * FROM capsules WHERE user_id = ?;',
    response_summary: 'Use bound SQL values', category: 'Database', usefulness: 'Very useful',
    reviewed: true, improved: false, screenshot_url: 'https://example.com/screenshot.png', notes: "Don't execute this SQL",
  };
  const capsule = await create(fields);
  assert.deepEqual(capsule, { ...fields, id: capsule.id, user_id: '101', created_at: capsule.created_at });
  assert.ok(Number.isSafeInteger(capsule.id) && capsule.id > 0);
  assert.ok(Number.isFinite(Date.parse(capsule.created_at)));
  const row = database.prepare('SELECT * FROM capsules WHERE id = ?').get(capsule.id);
  assert.deepEqual({ ...row }, { ...capsule, reviewed: 1, improved: 0 });
  const listed = await request();
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { capsules: [capsule] });
  const updated = await request(`/api/capsules/${capsule.id}`, {
    method: 'PUT', body: { ...fields, notes: 'Improved', reviewed: false, improved: true },
  });
  assert.equal(updated.status, 200);
  assert.deepEqual((await updated.json()).capsule, { ...capsule, notes: 'Improved', reviewed: false, improved: true });
  const survivor = await create({ ...required, notes: 'Keep this record' });
  const removed = await request(`/api/capsules/${capsule.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
  assert.equal(removed.headers.get('content-type'), null);
  assert.deepEqual((await (await request()).json()).capsules.map((item) => item.id), [survivor.id]);
});

test('list, update and delete use only the JWT owner and conceal other owners’ records', async (t) => {
  const { request, create, alice, bob } = await fixture(t);
  const aliceRecord = await create();
  const bobRecord = await create({ ...required, notes: 'Bob only' }, bob);
  const bobList = await request('/api/capsules?user_id=101', { token: bob, headers: { 'X-User-Id': '101' } });
  assert.deepEqual(await bobList.json(), { capsules: [bobRecord] });
  for (const method of ['PUT', 'DELETE']) {
    const init = { method, token: bob, ...(method === 'PUT' ? { body: required } : {}) };
    const foreign = await request(`/api/capsules/${aliceRecord.id}`, init);
    const missing = await request('/api/capsules/999999', init);
    assert.equal(foreign.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(await foreign.json(), await missing.json());
  }
  assert.deepEqual(await (await request('/api/capsules', { token: alice })).json(), { capsules: [aliceRecord] });
});

test('PUT replaces writable fields, resets optional omissions and requires mandatory fields', async (t) => {
  const { request, create } = await fixture(t);
  const original = await create({ ...required, notes: 'Old note', prompt_version: '3', reviewed: true });
  const response = await request(`/api/capsules/${original.id}`, { method: 'PUT', body: required });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).capsule, {
    ...required, id: original.id, user_id: original.user_id, created_at: original.created_at,
    prompt_version: '1', response_summary: '', category: '', usefulness: '',
    reviewed: false, improved: false, screenshot_url: '', notes: '',
  });
  assert.equal((await request(`/api/capsules/${original.id}`, { method: 'PUT', body: { notes: 'Partial' } })).status, 400);
});

test('protected and unsupported body fields are rejected without changing the record', async (t) => {
  const { request, create } = await fixture(t);
  const original = await create();
  for (const field of ['user_id', 'id', 'created_at', 'unknown', '__proto__', 'notes = NULL; --']) {
    const body = { ...required, [field]: 'attempted override' };
    for (const [method, path] of [['POST', '/api/capsules'], ['PUT', `/api/capsules/${original.id}`]]) {
      const response = await request(path, { method, body });
      assert.equal(response.status, 400);
      const error = await response.json();
      assert.ok(error.details.some((detail) => detail.field === field && detail.message === 'Field is not writable.'));
    }
  }
  assert.deepEqual(await (await request()).json(), { capsules: [original] });
});

test('invalid values, URLs, JSON, content types and IDs give safe JSON errors', async (t) => {
  const { request, create } = await fixture(t);
  const original = await create();
  const invalidBodies = [null, [], 'string', {},
    { ...required, project_name: '  ' }, { ...required, prompt_title: '\t\n' },
    { ...required, prompt_text: '' }, { ...required, prompt_version: '' },
    { ...required, project_name: null }, { ...required, notes: 10 },
    { ...required, reviewed: 'false' }, { ...required, improved: 1 },
    { ...required, reviewed: null }, { ...required, category: [] },
    { ...required, screenshot_url: 'javascript:alert(1)' },
    { ...required, screenshot_url: 'data:image/png;base64,abc' },
    { ...required, screenshot_url: '/relative.png' },
    { ...required, screenshot_url: 'https://user:password@example.com/image' },
  ];
  const limits = { project_name: 120, prompt_title: 200, prompt_version: 40, prompt_text: 20000,
    response_summary: 10000, category: 80, usefulness: 200, screenshot_url: 2048, notes: 10000 };
  for (const [field, limit] of Object.entries(limits)) invalidBodies.push({ ...required, [field]: 'x'.repeat(limit + 1) });
  for (const body of invalidBodies) {
    const response = await request('/api/capsules', { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /application\/json/);
  }
  for (const rawBody of ['{broken', '{"notes":', 'null', '123', '"text"', '{"notes":"' + 'x'.repeat(140000) + '"}']) {
    const response = await request('/api/capsules', { method: 'POST', rawBody });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.doesNotMatch(text, /SyntaxError|stack|at file:|INSERT INTO|SELECT \*/);
  }
  assert.equal((await request('/api/capsules', { method: 'POST', rawBody: JSON.stringify(required), headers: { 'Content-Type': 'text/plain' } })).status, 400);
  for (const id of ['0', '-1', '01', '1.5', '1e2', '9007199254740992', 'abc', '1 OR 1=1', '%E0%A4%A']) {
    for (const method of ['PUT', 'DELETE']) {
      const response = await request(`/api/capsules/${encodeURI(id)}`, { method, ...(method === 'PUT' ? { body: required } : {}) });
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /application\/json/);
    }
  }
  const malformedId = await request('/api/capsules/%E0%A4%A', { method: 'DELETE' });
  assert.equal(malformedId.status, 400);
  assert.deepEqual(await malformedId.json(), { error: 'Invalid request path.' });
  assert.deepEqual(await (await request()).json(), { capsules: [original] });
});

test('valid length boundaries, boolean values and optional empty values round-trip', async (t) => {
  const { create } = await fixture(t);
  const capsule = await create({
    ...required, project_name: 'x'.repeat(120), prompt_title: 'x'.repeat(200),
    prompt_version: 'x'.repeat(40), prompt_text: 'x'.repeat(20000), response_summary: 'x'.repeat(10000),
    category: 'x'.repeat(80), usefulness: 'x'.repeat(200), notes: 'x'.repeat(10000),
    reviewed: false, improved: true, screenshot_url: '  ',
  });
  assert.equal(capsule.prompt_text.length, 20000);
  assert.equal(capsule.notes.length, 10000);
  assert.equal(capsule.screenshot_url, '');
  assert.equal(capsule.reviewed, false);
  assert.equal(capsule.improved, true);
  assert.equal((await create({ ...required, screenshot_url: 'http://example.com/image' })).screenshot_url, 'http://example.com/image');
});

test('mutations require an exact same Origin and failed CSRF checks never mutate storage', async (t) => {
  const { request, create } = await fixture(t);
  const original = await create();
  for (const origin of [null, 'null', 'https://evil.example', 'http://localhost:5173', 'https://localhost:5173.evil.example']) {
    for (const [method, path] of [['POST', '/api/capsules'], ['PUT', `/api/capsules/${original.id}`], ['DELETE', `/api/capsules/${original.id}`]]) {
      const response = await request(path, { method, origin, ...(method === 'DELETE' ? {} : { body: required }) });
      assert.equal(response.status, 403);
    }
  }
  assert.deepEqual(await (await request()).json(), { capsules: [original] });
  assert.equal((await request('/api/capsules', { origin: null })).status, 200);
});

test('unexpected storage failures return a generic 500 without SQL or stack details', async (t) => {
  const { request, database } = await fixture(t);
  database.exec('DROP TABLE capsules');
  for (const [method, path] of [['GET', '/api/capsules'], ['POST', '/api/capsules'], ['PUT', '/api/capsules/1'], ['DELETE', '/api/capsules/1']]) {
    const response = await request(path, { method, ...(method === 'POST' || method === 'PUT' ? { body: required } : {}) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'An unexpected server error occurred.' });
  }
});

test('DELETE rejects malformed JSON and unexpected bodies without removing the capsule', async (t) => {
  const { request, create } = await fixture(t);
  const original = await create();
  for (const rawBody of ['{broken', '{}', '{"user_id":"202"}', 'plain text']) {
    const response = await request(`/api/capsules/${original.id}`, {
      method: 'DELETE', rawBody,
      ...(rawBody === 'plain text' ? { headers: { 'Content-Type': 'text/plain' } } : {}),
    });
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /application\/json/);
  }
  assert.deepEqual(await (await request()).json(), { capsules: [original] });
});

test('rejected asynchronous storage operations return generic 500 responses for every CRUD route', async (t) => {
  const reject = async () => { throw new Error('private SQL details'); };
  const { request } = await fixture(t, { list: reject, create: reject, update: reject, delete: reject });
  for (const [method, path] of [
    ['GET', '/api/capsules'], ['POST', '/api/capsules'],
    ['PUT', '/api/capsules/1'], ['DELETE', '/api/capsules/1'],
  ]) {
    const response = await request(path, { method,
      ...(['POST', 'PUT'].includes(method) ? { body: required } : {}) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'An unexpected server error occurred.' });
  }
});
