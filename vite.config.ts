import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// A unique id per build. The running app compares it with /version.json to
// notice when a newer deployment is live.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? String(Date.now())

const versionFile = (): Plugin => ({
  name: 'lilac-version',
  apply: 'build',
  closeBundle() {
    mkdirSync('dist', { recursive: true })
    writeFileSync('dist/version.json', JSON.stringify({ id: BUILD_ID }))
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  test: { include: ['src/**/*.test.ts', 'api/**/*.test.ts'] },
  // `npm run dev:api` (or `vercel dev`) serves /api on :3000; the dev server forwards to it
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
