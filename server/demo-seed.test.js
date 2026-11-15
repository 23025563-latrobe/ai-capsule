import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './database.js';
import { createCapsuleStorage } from './capsule-storage.js';
import { demoCapsules, seedDemoCapsules } from '../scripts/demo-capsules.js';
import { seedProductionDemos } from '../scripts/seed-demo-capsules.js';
import { validateCapsule } from './capsule-validation.js';

test('demo records satisfy the API contract and include independent review states without evidence URLs', () => {
  assert.equal(demoCapsules.length, 10);
  const combinations = new Set();
  for (const record of demoCapsules) {
    assert.deepEqual(validateCapsule(record).errors, []);
    assert.ok(record.project_name.startsWith('Demo'));
    assert.match(record.notes, /Fictional demonstration data/);
    assert.equal(record.screenshot_url, '');
    assert.ok(['', 'Good', 'Needs improvement'].includes(record.usefulness));
    combinations.add(`${record.reviewed}/${record.improved}`);
  }
  assert.equal(combinations.size, 4);
  assert.ok(demoCapsules.some((record) => !record.response_summary));
  assert.ok(demoCapsules.some((record) => !record.usefulness));
});

test('seeding preserves existing and foreign records, skips matches and verifies exact inserted text', async (t) => {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  const storage = createCapsuleStorage(database);
  const matching = storage.create('101', { ...demoCapsules[0], notes: 'Existing edited record' });
  const unrelated = storage.create('101', { project_name: 'Existing work', prompt_title: 'Keep me', prompt_text: 'Original text' });
  const foreign = storage.create('202', demoCapsules[1]);
  const first = await seedDemoCapsules(storage, '101');
  assert.equal(first.inserted, 9);
  assert.equal(first.skipped, 1);
  assert.ok(first.records.every((record) => record.ownerMatches));
  const second = await seedDemoCapsules(storage, '101');
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 10);
  const saved = storage.list('101');
  assert.equal(saved.length, 11);
  assert.deepEqual(saved.find((record) => record.id === matching.id), matching);
  assert.deepEqual(saved.find((record) => record.id === unrelated.id), unrelated);
  assert.deepEqual(storage.list('202'), [foreign]);
  const longPrompt = demoCapsules[9];
  assert.equal(saved.find((record) => record.prompt_title === longPrompt.prompt_title).prompt_text, longPrompt.prompt_text);
  await assert.rejects(seedDemoCapsules(storage, 'RLirri'), /numeric GitHub owner ID/);
});

test('production seed refuses a local or incorrectly configured target before owner lookup', async () => {
  await assert.rejects(seedProductionDemos({ DATABASE_BACKEND: 'sqlite' }, 'RLirri'), /production Azure SQL target/);
});
