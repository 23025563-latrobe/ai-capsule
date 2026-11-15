const writableFields = new Set([
  'project_name', 'prompt_title', 'prompt_version', 'prompt_text',
  'response_summary', 'category', 'usefulness', 'reviewed', 'improved',
  'screenshot_url', 'notes',
]);

export function requireOwner(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new TypeError('A trusted, non-empty owner ID is required.');
  }
}

export function writableEntries(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new TypeError('Capsule fields must be an object.');
  }
  return Object.entries(fields).map(([field, value]) => {
    if (!writableFields.has(field)) throw new TypeError(`Field is not writable: ${field}`);
    if (field === 'reviewed' || field === 'improved') {
      if (![true, false, 0, 1].includes(value)) {
        throw new TypeError(`${field} must be a boolean or 0/1.`);
      }
      return [field, Number(value)];
    }
    if (typeof value !== 'string') throw new TypeError(`${field} must be a string.`);
    return [field, value];
  });
}

// Future routes must pass the owner from their verified JWT, never request data.
export function createCapsuleStorage(database) {
  return {
    create(ownerId, fields) {
      requireOwner(ownerId);
      const entries = writableEntries(fields);
      const columns = ['user_id', ...entries.map(([field]) => field)];
      return database.prepare(`
        INSERT INTO capsules (${columns.join(', ')})
        VALUES (${columns.map(() => '?').join(', ')}) RETURNING *
      `).get(ownerId, ...entries.map(([, value]) => value));
    },

    list(ownerId) {
      requireOwner(ownerId);
      return database.prepare(`
        SELECT * FROM capsules WHERE user_id = ? ORDER BY created_at DESC, id DESC
      `).all(ownerId);
    },

    update(ownerId, id, fields) {
      requireOwner(ownerId);
      const entries = writableEntries(fields);
      if (!entries.length) throw new TypeError('At least one writable field is required.');
      return database.prepare(`
        UPDATE capsules SET ${entries.map(([field]) => `${field} = ?`).join(', ')}
        WHERE id = ? AND user_id = ? RETURNING *
      `).get(...entries.map(([, value]) => value), id, ownerId) ?? null;
    },

    delete(ownerId, id) {
      requireOwner(ownerId);
      return database.prepare('DELETE FROM capsules WHERE id = ? AND user_id = ?')
        .run(id, ownerId).changes === 1;
    },
  };
}
