import { readFile } from 'node:fs/promises';
import { connectAzureSql } from '../server/azure-sql.js';

let pool;
try {
  if (process.env.DATABASE_BACKEND !== 'azure-sql') {
    throw new Error('Set DATABASE_BACKEND=azure-sql to run this migration.');
  }
  pool = await connectAzureSql(process.env);
  const schema = await readFile(new URL('../sql/001-capsules.sql', import.meta.url), 'utf8');
  await pool.request().batch(schema);
  console.log('Azure SQL schema is ready.');
} catch {
  console.error('Azure SQL migration failed. Check configuration, connectivity and migration permissions.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.close();
}
