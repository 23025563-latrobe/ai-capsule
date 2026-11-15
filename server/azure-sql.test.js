import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { azureSqlConfig, connectAzureSql, createAzureSqlStorage } from './azure-sql.js';
import { openStorage } from './storage.js';

const env = { AZURE_SQL_SERVER: 'fictional.database.windows.net', AZURE_SQL_DATABASE: 'capsules' };
const row = {
  id: '42', user_id: '101', project_name: 'Fictional demo', prompt_title: 'SQL',
  prompt_version: 'v2', prompt_text: "Quotes ' & Unicode 中文\nSELECT * FROM capsules;",
  response_summary: '', category: 'Custom', usefulness: '', reviewed: false, improved: true,
  screenshot_url: '', notes: '', created_at: new Date('2026-01-01T01:02:03.123Z'),
};

function mockPool(results = []) {
  const calls = [];
  let closed = false;
  return {
    calls, get closed() { return closed; },
    async close() { closed = true; },
    request() {
      const call = { parameters: {} };
      calls.push(call);
      return {
        input(name, type, value) { call.parameters[name] = { type, value }; return this; },
        async query(query) {
          call.query = query;
          const result = results.shift();
          if (result instanceof Error) throw result;
          return { recordset: result || [] };
        },
      };
    },
  };
}

test('SQL config requires explicit connection settings and enforces TLS and identity authentication', () => {
  assert.throws(() => azureSqlConfig({}), /requires AZURE_SQL/);
  assert.throws(() => azureSqlConfig({ ...env, AZURE_SQL_AUTHENTICATION: 'password' }), /AUTHENTICATION/);
  const config = azureSqlConfig(env);
  assert.equal(config.authentication.type, 'azure-active-directory-msi-app-service');
  assert.deepEqual(config.options, { encrypt: true, trustServerCertificate: false, useUTC: true });
  assert.equal(azureSqlConfig({ ...env, AZURE_SQL_AUTHENTICATION: 'default' }).authentication.type,
    'azure-active-directory-default');
});

test('failed SQL connections are closed and driver details are not exposed', async () => {
  let closed = false;
  class FailedPool extends EventEmitter {
    async connect() { throw new Error('sensitive-driver-details'); }
    async close() { closed = true; }
  }
  await assert.rejects(connectAzureSql(env, { ConnectionPool: FailedPool }), (error) => {
    assert.match(error.message, /Azure SQL connection failed/);
    assert.doesNotMatch(error.message, /sensitive-driver/);
    return true;
  });
  assert.equal(closed, true);
});

test('mocked SQL creates bind every supplied value and preserve all returned fields', async () => {
  const pool = mockPool([[row]]);
  const storage = createAzureSqlStorage(pool);
  const { id, user_id, created_at, ...fields } = row;
  const saved = await storage.create(user_id, fields);
  assert.deepEqual(saved, { ...row, id: 42, reviewed: 0, improved: 1,
    created_at: '2026-01-01T01:02:03.123Z' });
  const call = pool.calls[0];
  assert.equal(call.parameters.owner.value, '101');
  for (const [name, value] of Object.entries(fields)) {
    assert.equal(call.parameters[name].value, ['reviewed', 'improved'].includes(name) ? Number(value) : value);
  }
  assert.doesNotMatch(call.query, /Unicode|SELECT \* FROM capsules/);
  assert.match(call.query, /OUTPUT INSERTED.id/);
  assert.equal(saved.prompt_text, fields.prompt_text);
});

test('mocked SQL reads and mutations scope every query to the trusted owner', async () => {
  const pool = mockPool([[row], [row], [], [], [{ id: 42 }]]);
  const storage = createAzureSqlStorage(pool);
  assert.equal((await storage.list('101'))[0].id, 42);
  assert.equal((await storage.update('101', 42, { reviewed: false, notes: 'unchanged' })).reviewed, 0);
  assert.equal(await storage.update('202', 42, { notes: '' }), null);
  assert.equal(await storage.delete('202', 42), false);
  assert.equal(await storage.delete('101', 42), true);
  for (const call of pool.calls) assert.match(call.query, /user_id = @owner/);
  assert.match(pool.calls[0].query, /ORDER BY created_at DESC, id DESC/);
  assert.match(pool.calls[1].query, /WHERE id = @id AND user_id = @owner/);
  assert.equal(pool.calls[1].parameters.id.value, 42);
  assert.equal(pool.calls[1].parameters.reviewed.value, 0);
});

test('SQL adapter rejects owner and protected-field overrides before executing SQL', async () => {
  const pool = mockPool();
  const storage = createAzureSqlStorage(pool);
  await assert.rejects(storage.list(''), /owner ID/);
  for (const field of ['id', 'user_id', 'created_at', 'unknown']) {
    await assert.rejects(storage.create('101', { [field]: 'override' }), /not writable/);
    await assert.rejects(storage.update('101', 42, { [field]: 'override' }), /not writable/);
  }
  await assert.rejects(storage.update('101', 42, {}), /At least one/);
  await assert.rejects(storage.update('101', 42, { reviewed: 'false' }), /boolean/);
  assert.ok(pool.calls.every((call) => !call.query));
});

test('backend selection preserves SQLite records across reopen and rejects unknown backends', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'capsule-backend-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = { DATABASE_PATH: join(directory, 'local.sqlite') };
  let connection = await openStorage(config);
  const saved = await connection.storage.create('101', {
    project_name: 'Demo', prompt_title: 'Title', prompt_text: 'Text',
  });
  await connection.close();
  connection = await openStorage(config);
  assert.deepEqual(await connection.storage.list('101'), [saved]);
  await connection.close();
  await assert.rejects(openStorage({ DATABASE_BACKEND: 'typo' }), /DATABASE_BACKEND/);
});

test('SQL selection verifies schema without DDL, closes on failure and never falls back', async () => {
  const config = { ...env, DATABASE_BACKEND: 'azure-sql' };
  const pool = mockPool();
  const connection = await openStorage(config, async () => pool);
  assert.match(pool.calls[0].query, /SELECT TOP \(0\)/);
  assert.doesNotMatch(pool.calls[0].query, /CREATE|ALTER/);
  await connection.close();
  assert.equal(pool.closed, true);
  const failedPool = mockPool([new Error('no schema')]);
  await assert.rejects(openStorage(config, async () => failedPool), /schema is unavailable/);
  assert.equal(failedPool.closed, true);
  await assert.rejects(openStorage(config, async () => { throw new Error('no connection'); }), /no connection/);
});
