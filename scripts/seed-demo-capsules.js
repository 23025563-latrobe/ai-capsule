import { pathToFileURL } from 'node:url';
import { openStorage } from '../server/storage.js';
import { seedDemoCapsules } from './demo-capsules.js';

export async function seedProductionDemos(env, login) {
  if (env.DATABASE_BACKEND !== 'azure-sql' ||
      env.PUBLIC_APP_URL !== 'https://app-ai-capsule-23025563.azurewebsites.net' ||
      env.AZURE_SQL_SERVER !== 'sql-ai-capsule-23025563.database.windows.net' ||
      env.AZURE_SQL_DATABASE !== 'ai-capsule') {
    throw new Error('The production Azure SQL target must be explicitly configured.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login || '')) {
    throw new Error('Supply the intended GitHub login explicitly.');
  }
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AI-Capsule-demo-setup' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('GitHub owner lookup failed.');
  const user = await response.json();
  if (user.login?.toLowerCase() !== login.toLowerCase() || !Number.isSafeInteger(user.id) || user.id < 1) {
    throw new Error('GitHub owner identity could not be verified.');
  }
  const connection = await openStorage(env);
  try {
    return await seedDemoCapsules(connection.storage, String(user.id));
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await seedProductionDemos(process.env, process.argv[2])));
  } catch {
    console.error('Demo insertion failed. Check the target, owner lookup and database access; existing records were not overwritten.');
    process.exitCode = 1;
  }
}
