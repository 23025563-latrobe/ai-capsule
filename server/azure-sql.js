import sql from 'mssql';
import { requireOwner, writableEntries } from './capsule-storage.js';

const columns = [
  'id', 'user_id', 'project_name', 'prompt_title', 'prompt_version', 'prompt_text',
  'response_summary', 'category', 'usefulness', 'reviewed', 'improved',
  'screenshot_url', 'notes', 'created_at',
];

export function azureSqlConfig(env) {
  if (!env.AZURE_SQL_SERVER?.trim() || !env.AZURE_SQL_DATABASE?.trim()) {
    throw new Error('Azure SQL requires AZURE_SQL_SERVER and AZURE_SQL_DATABASE.');
  }
  const authentication = env.AZURE_SQL_AUTHENTICATION || 'managed-identity';
  if (!['managed-identity', 'default'].includes(authentication)) {
    throw new Error('AZURE_SQL_AUTHENTICATION must be managed-identity or default.');
  }
  return {
    server: env.AZURE_SQL_SERVER,
    database: env.AZURE_SQL_DATABASE,
    authentication: {
      type: authentication === 'managed-identity'
        ? 'azure-active-directory-msi-app-service' : 'azure-active-directory-default',
    },
    options: { encrypt: true, trustServerCertificate: false, useUTC: true },
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    pool: { max: 3, min: 0, idleTimeoutMillis: 30_000 },
  };
}

export function sqlFailureCode(error) {
  const knownCodes = ['ELOGIN', 'ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN', 'EREQUEST'];
  const code = knownCodes.includes(error?.code) ? error.code : 'unknown';
  const candidates = [error, error?.originalError, ...(error?.precedingErrors || [])];
  const number = candidates.map((item) => item?.number ?? item?.info?.number)
    .find((value) => Number.isSafeInteger(value) && value > 0);
  // Keep useful driver codes without logging messages that may contain credentials.
  return number ? `${code}; SQL ${number}` : code;
}

export async function connectAzureSql(env, driver = sql) {
  const pool = new driver.ConnectionPool(azureSqlConfig(env));
  // Pool errors may arrive outside a request. Log no driver details or tokens.
  pool.on('error', () => console.error('Azure SQL connection pool error.'));
  try {
    await pool.connect();
    return pool;
  } catch (error) {
    await pool.close();
    throw new Error(`Azure SQL connection failed (${sqlFailureCode(error)}). Check identity, firewall and database configuration.`);
  }
}

function capsuleRow(row) {
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid database capsule ID.');
  return {
    ...row, id,
    reviewed: Number(row.reviewed), improved: Number(row.improved),
    created_at: row.created_at.toISOString(),
  };
}

export function createAzureSqlStorage(pool) {
  function ownedRequest(ownerId) {
    requireOwner(ownerId);
    return pool.request().input('owner', sql.NVarChar(128), ownerId);
  }

  function writeParameters(request, fields) {
    const entries = writableEntries(fields);
    for (const [field, value] of entries) {
      request.input(field, ['reviewed', 'improved'].includes(field)
        ? sql.Bit : sql.NVarChar(sql.MAX), value);
    }
    return entries.map(([field]) => field);
  }

  return {
    async create(ownerId, fields) {
      const request = ownedRequest(ownerId);
      const names = writeParameters(request, fields);
      const result = await request.query(`
        INSERT INTO dbo.capsules (user_id${names.map((name) => `, ${name}`).join('')})
        OUTPUT ${columns.map((name) => `INSERTED.${name}`).join(', ')}
        VALUES (@owner${names.map((name) => `, @${name}`).join('')})
      `);
      return capsuleRow(result.recordset[0]);
    },
    async list(ownerId) {
      const result = await ownedRequest(ownerId).query(`
        SELECT ${columns.join(', ')} FROM dbo.capsules
        WHERE user_id = @owner ORDER BY created_at DESC, id DESC
      `);
      return result.recordset.map(capsuleRow);
    },
    async update(ownerId, id, fields) {
      const request = ownedRequest(ownerId).input('id', sql.BigInt, id);
      const names = writeParameters(request, fields);
      if (!names.length) throw new TypeError('At least one writable field is required.');
      const result = await request.query(`
        UPDATE dbo.capsules SET ${names.map((name) => `${name} = @${name}`).join(', ')}
        OUTPUT ${columns.map((name) => `INSERTED.${name}`).join(', ')}
        WHERE id = @id AND user_id = @owner
      `);
      return capsuleRow(result.recordset[0]);
    },
    async delete(ownerId, id) {
      const result = await ownedRequest(ownerId).input('id', sql.BigInt, id).query(`
        DELETE FROM dbo.capsules OUTPUT DELETED.id WHERE id = @id AND user_id = @owner
      `);
      return result.recordset.length === 1;
    },
  };
}

export async function verifyAzureSqlSchema(pool) {
  // Runtime needs SELECT permission, never schema creation privileges.
  await pool.request().query(`SELECT TOP (0) ${columns.join(', ')} FROM dbo.capsules`);
}
