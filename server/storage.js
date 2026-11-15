import { openDatabase } from './database.js';
import { createCapsuleStorage } from './capsule-storage.js';
import { connectAzureSql, createAzureSqlStorage, verifyAzureSqlSchema, sqlFailureCode } from './azure-sql.js';

export async function openStorage(env = process.env, connect = connectAzureSql) {
  const backend = env.DATABASE_BACKEND || 'sqlite';
  if (backend === 'sqlite') {
    const database = openDatabase(env.DATABASE_PATH || 'data/ai-capsule.sqlite');
    return {
      storage: createCapsuleStorage(database),
      close: async () => { if (database.isOpen) database.close(); },
    };
  }
  if (backend !== 'azure-sql') throw new Error('DATABASE_BACKEND must be sqlite or azure-sql.');
  const pool = await connect(env);
  try {
    await verifyAzureSqlSchema(pool);
    return { storage: createAzureSqlStorage(pool), close: () => pool.close() };
  } catch (error) {
    await pool.close();
    throw new Error(`Azure SQL schema is unavailable (${sqlFailureCode(error)}). Check connectivity, table permissions and migrations.`);
  }
}
