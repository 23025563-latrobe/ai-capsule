import express from 'express';
import { openDatabase } from './database.js';

const database = openDatabase();
const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(port);

server.once('listening', () => {
  console.log(`AI Capsule API is running on http://localhost:${port}`);
});

server.on('error', (error) => {
  database.close();
  console.error(error);
  process.exitCode = 1;
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    database.close();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
