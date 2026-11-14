import { createApp } from './app.js';
import { openDatabase } from './database.js';

const database = openDatabase();
const app = createApp();
const port = Number(process.env.PORT || 3001);

const server = app.listen(port);

server.once('listening', () => {
  console.log(`AI Capsule API is running on http://localhost:${port}`);
});

server.on('error', (error) => {
  if (database.isOpen) database.close();
  console.error(error);
  process.exitCode = 1;
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    if (database.isOpen) database.close();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
