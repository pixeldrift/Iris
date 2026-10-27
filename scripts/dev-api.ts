/**
 * A local stand-in for the Vercel functions, backed by an in-memory Postgres (PGlite), so you can try
 * accounts and sync without a Neon database:
 *
 *   npm run dev:api     (this, on :3000)
 *   npm run dev         (the app on :5173, which forwards /api here)
 *
 * Data lives in memory and is gone when this stops. Use `vercel dev` with a real DATABASE_URL for the real thing.
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const PG_PORT = 54329
const PORT = Number(process.env.PORT ?? 3000)

const db = new PGlite()
await new PGLiteSocketServer({ db, port: PG_PORT, host: '127.0.0.1' }).start()
await db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))

process.env.DATABASE_URL ??= `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`
process.env.BETTER_AUTH_SECRET ??= 'dev-only-secret-dev-only-secret-0123'
process.env.BETTER_AUTH_URL ??= 'http://localhost:5173'

const auth = await import('../api/auth/[...all].ts')
const sync = await import('../api/sync.ts')

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  })
  let response: Response
  try {
    if (url.pathname.startsWith('/api/auth/')) response = await (req.method === 'POST' ? auth.POST : auth.GET)(request)
    else if (url.pathname === '/api/sync' && req.method === 'POST') response = await sync.POST(request)
    else response = new Response('Not found', { status: 404 })
  } catch (e) {
    console.error(e)
    response = new Response('Server error', { status: 500 })
  }
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((v, k) => {
    if (k !== 'set-cookie') headers[k] = v
  })
  const cookies = response.headers.getSetCookie?.()
  if (cookies?.length) headers['set-cookie'] = cookies
  res.writeHead(response.status, headers)
  res.end(Buffer.from(await response.arrayBuffer()))
}).listen(PORT, () => console.log(`Lilac dev API on http://localhost:${PORT} (in-memory database)`))
