import { createApp } from './app.js';
import { openStorage } from './storage.js';

let connection;
async function closeStorage() {
  try {
    if (connection) await connection.close();
  } catch {
    console.error('AI Capsule could not close its database connection.');
    process.exitCode = 1;
  }
}

try {
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT.');
  if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== '1') {
    throw new Error('TRUST_PROXY must be 1 or omitted.');
  }
  connection = await openStorage();
  const app = createApp({ storage: connection.storage });
  const server = app.listen(port, '0.0.0.0');

  server.once('listening', () => {
    console.log(`AI Capsule is listening on port ${server.address().port}.`);
  });
  server.on('error', async () => {
    await closeStorage();
    console.error('AI Capsule could not start its HTTP listener.');
    process.exitCode = 1;
  });

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    deadline.unref();
    server.close(async () => {
      clearTimeout(deadline);
      await closeStorage();
    });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  await closeStorage();
  console.error(`AI Capsule startup failed: ${error.message}`);
  process.exitCode = 1;
}
