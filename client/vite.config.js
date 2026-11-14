import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const appUrl = new URL(env.PUBLIC_APP_URL || 'https://localhost:5173')
  let https
  if (command === 'serve') {
    try {
      https = {
        key: readFileSync(new URL('../.certs/localhost-key.pem', import.meta.url)),
        cert: readFileSync(new URL('../.certs/localhost.pem', import.meta.url)),
      }
    } catch {
      throw new Error('Local HTTPS certificate missing. Run npm run dev:cert from the repository root.')
    }
  }

  return {
    plugins: [react()],
    // Only VITE_-prefixed values are exposed to frontend JavaScript.
    envDir: projectRoot,
    server: {
      host: 'localhost',
      port: Number(appUrl.port || 443),
      strictPort: true,
      https,
      proxy: {
        '/api': { target: `http://127.0.0.1:${env.PORT || 3001}` },
      },
    },
  }
})
