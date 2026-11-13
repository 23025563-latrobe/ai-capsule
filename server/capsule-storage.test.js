import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openDatabase } from './database.js';
import { createCapsuleStorage } from './capsule-storage.js';

const required = { project_name: 'Assessment', prompt_title: 'Design', prompt_text: 'Explain SQL' };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ai-capsule-test-'));
  const path = join(directory, 'nested', 'capsules.sqlite');
  let database = openDatabase(path);
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    get database() { return database; },
    get storage() { return createCapsuleStorage(database); },
    reopen() {
      database.close();
      database = openDatabase(path);
    },
  };
}

// SQLite returns rows with a null prototype.
function plain(row) { return { ...row }; }

test('initialisation creates directories and preserves records across repeated opens', (t) => {
  const context = fixture(t);
  assert.deepEqual(context.storage.list('alice'), []);
  const capsule = context.storage.create('alice', required);
  context.reopen();
  context.reopen();
  assert.deepEqual(plain(context.storage.list('alice')[0]), plain(capsule));
});

test('all fields round-trip, including quotes and SQL-like values', (t) => {
  const { storage } = fixture(t);
  const fields = {
    ...required,
    project_name: "Alice's project",
    prompt_title: "'); DROP TABLE capsules; --",
    prompt_version: '2.1',
    prompt_text: 'SELECT * FROM capsules WHERE user_id = "bob";',
    response_summary: 'A useful response',
    category: 'Database',
    usefulness: 'Very useful',
    reviewed: true,
    improved: false,
    screenshot_url: 'https://example.com/screenshot.png',
    notes: "Don't execute this SQL",
  };
  const capsule = storage.create('alice', fields);
  assert.deepEqual(plain(capsule), {
    ...fields, reviewed: 1, improved: 0,
    id: capsule.id, user_id: 'alice', created_at: capsule.created_at,
  });
  assert.ok(Number.isInteger(capsule.id));
  assert.ok(Number.isFinite(Date.parse(capsule.created_at)));
  assert.deepEqual(plain(storage.list('alice')[0]), plain(capsule));
  assert.equal(storage.create('bob', required).user_id, 'bob');
});

test('defaults, required values and boolean constraints are enforced', (t) => {
  const { storage, database } = fixture(t);
  const capsule = storage.create('alice', required);
  for (const field of ['response_summary', 'category', 'usefulness', 'screenshot_url', 'notes']) {
    assert.equal(capsule[field], '');
  }
  assert.equal(capsule.prompt_version, '1');
  assert.equal(capsule.reviewed, 0);
  assert.equal(capsule.improved, 0);
  for (const field of Object.keys(required)) {
    const missing = { ...required };
    delete missing[field];
    assert.throws(() => storage.create('alice', missing), /NOT NULL/);
    assert.throws(() => storage.create('alice', { ...required, [field]: '  ' }), /CHECK/);
    assert.throws(() => storage.create('alice', { ...required, [field]: null }), /string/);
  }
  assert.throws(() => storage.create('alice', { ...required, prompt_version: '' }), /CHECK/);
  for (const owner of [undefined, null, '', '  ', 1]) {
    assert.throws(() => storage.create(owner, required), /owner ID/);
    assert.throws(() => storage.list(owner), /owner ID/);
    assert.throws(() => storage.update(owner, capsule.id, { notes: 'test' }), /owner ID/);
    assert.throws(() => storage.delete(owner, capsule.id), /owner ID/);
  }
  for (const field of ['reviewed', 'improved']) {
    assert.throws(() => storage.update('alice', capsule.id, { [field]: 'false' }), /boolean/);
    assert.throws(() => database.prepare(`UPDATE capsules SET ${field} = 2`).run(), /CHECK/);
    assert.throws(() => database.prepare(`UPDATE capsules SET ${field} = NULL`).run(), /NOT NULL/);
  }
  assert.throws(() => database.prepare('UPDATE capsules SET user_id = ?').run(' '), /CHECK/);
});

test('owners cannot list, update or delete another owner’s capsules', (t) => {
  const { storage } = fixture(t);
  const alice = storage.create('alice', required);
  const bob = storage.create('bob', required);
  assert.deepEqual(storage.list('alice').map((row) => row.id), [alice.id]);
  assert.equal(storage.update('alice', bob.id, { notes: 'stolen' }), null);
  assert.equal(storage.delete('alice', bob.id), false);
  assert.equal(storage.update("' OR 1=1 --", bob.id, { notes: 'stolen' }), null);
  assert.equal(storage.delete('alice', '1 OR 1=1'), false);
  assert.deepEqual(storage.list("' OR 1=1 --"), []);
  assert.deepEqual(plain(storage.list('bob')[0]), plain(bob));
  assert.equal(storage.update('alice', -1, { notes: 'missing' }), null);
  assert.equal(storage.delete('alice', -1), false);
});

test('updates preserve metadata and reject every non-writable field', (t) => {
  const { storage } = fixture(t);
  const original = storage.create('alice', required);
  for (const field of ['id', 'user_id', 'created_at', 'unknown', 'notes = NULL; --']) {
    assert.throws(() => storage.update('alice', original.id, { [field]: 'changed' }), /not writable/);
    assert.throws(() => storage.create('alice', { ...required, [field]: 'changed' }), /not writable/);
  }
  assert.throws(() => storage.update('alice', original.id, {}), /At least one/);
  assert.throws(() => storage.update('alice', original.id, { prompt_text: '' }), /CHECK/);
  const updated = storage.update('alice', original.id, { notes: "It's improved", reviewed: true, improved: 1 });
  assert.deepEqual(plain(updated), { ...original, notes: "It's improved", reviewed: 1, improved: 1 });
});

test('listing breaks timestamp ties by ID and deletion removes only its owned target', (t) => {
  const { storage, database } = fixture(t);
  const first = storage.create('alice', required);
  const second = storage.create('alice', required);
  const bob = storage.create('bob', required);
  database.prepare('UPDATE capsules SET created_at = ?').run('2026-01-01T00:00:00.000Z');
  assert.deepEqual(storage.list('alice').map((row) => row.id), [second.id, first.id]);
  assert.equal(storage.delete('alice', first.id), true);
  assert.equal(storage.delete('alice', first.id), false);
  assert.deepEqual(storage.list('alice').map((row) => row.id), [second.id]);
  assert.deepEqual(storage.list('bob').map((row) => row.id), [bob.id]);
});

test('DATABASE_PATH resolves from the project root even when launched elsewhere', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-capsule-path-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const path = join(directory, 'configured.sqlite');
  const database = openDatabase(path);
  createCapsuleStorage(database).create('alice', required);
  database.close();
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { openDatabase } from ${JSON.stringify(new URL('./database.js', import.meta.url).href)};
    const database = openDatabase();
    console.log(database.prepare('SELECT user_id FROM capsules').get().user_id);
    database.close();
  `], {
    cwd: directory,
    env: { ...process.env, DATABASE_PATH: relative(projectRoot, path) },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'alice');
});
