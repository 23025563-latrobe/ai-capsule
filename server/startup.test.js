import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function runStartup(env) {
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('production startup rejects invalid database selection and missing SQL settings without touching SQLite', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'capsule-startup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'must-not-create.sqlite');
  for (const backend of ['unknown', 'azure-sql']) {
    const result = await runStartup({ DATABASE_BACKEND: backend, DATABASE_PATH: path, PORT: '0' });
    assert.equal(result.code, 1);
    assert.match(result.output, /AI Capsule startup failed:/);
    assert.doesNotMatch(result.output, /listening on port/);
    assert.equal(existsSync(path), false);
  }
});
