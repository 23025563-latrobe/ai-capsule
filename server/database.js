import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function openDatabase(databasePath = process.env.DATABASE_PATH || 'data/ai-capsule.sqlite') {
  // Relative paths always start at the project root, regardless of the launch directory.
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(projectRoot, databasePath);
  if (resolvedPath !== ':memory:') mkdirSync(dirname(resolvedPath), { recursive: true });

  const database = new DatabaseSync(resolvedPath);
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS capsules (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
        project_name TEXT NOT NULL CHECK (length(trim(project_name)) > 0),
        prompt_title TEXT NOT NULL CHECK (length(trim(prompt_title)) > 0),
        prompt_version TEXT NOT NULL DEFAULT '1' CHECK (length(trim(prompt_version)) > 0),
        prompt_text TEXT NOT NULL CHECK (length(trim(prompt_text)) > 0),
        response_summary TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        usefulness TEXT NOT NULL DEFAULT '',
        reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
        improved INTEGER NOT NULL DEFAULT 0 CHECK (improved IN (0, 1)),
        screenshot_url TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS capsules_owner_created
        ON capsules (user_id, created_at DESC, id DESC);
    `);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
