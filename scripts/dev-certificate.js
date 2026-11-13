import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../.certs/', import.meta.url));
mkdirSync(directory, { recursive: true, mode: 0o700 });
const key = `${directory}/localhost-key.pem`;
const certificate = `${directory}/localhost.pem`;
if (existsSync(key) || existsSync(certificate)) {
  console.log('Local certificate files already exist. Remove them explicitly to regenerate.');
} else {
  const result = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
    '-keyout', key, '-out', certificate, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('OpenSSL could not create the local certificate.');
  chmodSync(key, 0o600);
  console.log('Local HTTPS certificate created. Trust .certs/localhost.pem for local development.');
  console.log('Alternatively, accept the browser warning at https://localhost:5173 for this local certificate.');
}
