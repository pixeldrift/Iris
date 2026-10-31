/**
 * A local stand-in for the deployed backend, so accounts and sync can be tried without Neon:
 *
 *   npm run dev:api     (this, on :3000)
 *   VITE_NEON_AUTH_URL=http://localhost:5173/api/auth npm run dev     (the app on :5173; it forwards /api here)
 *
 * It runs the real /api/sync handler on an in-memory Postgres (PGlite) and a tiny MOCK of Neon Auth (sign up,
 * sign in, session, JWT and its public keys) so the real client code can be exercised. It is a development aid only:
 * passwords are kept in memory in plain text, and everything is gone when it stops.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose'

const PG_PORT = 54329
const PORT = Number(process.env.PORT ?? 3000)
const APP = process.env.APP_ORIGIN ?? 'http://localhost:5173'

const db = new PGlite()
await new PGLiteSocketServer({ db, port: PG_PORT, host: '127.0.0.1' }).start()
await db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
const jwk = { ...(await exportJWK(publicKey)), kid: 'dev', alg: 'EdDSA', use: 'sig' }

// the in-memory database serves one connection at a time
process.env.PG_POOL_MAX ??= '1'
process.env.DATABASE_URL ??= `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`
process.env.NEON_AUTH_BASE_URL ??= `${APP}/api/auth`
process.env.NEON_AUTH_JWKS_URL ??= `http://localhost:${PORT}/api/auth/.well-known/jwks.json`
const sync = await import('../api/sync.ts')
const account = await import('../api/account.ts')
const connect = await import('../api/connect.ts')

// ---------- mock Neon Auth ----------
interface User {
  id: string
  name: string
  email: string
  password: string
}
const users = new Map<string, User>()
const sessions = new Map<string, string>() // session token -> user id
const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, emailVerified: false, image: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
const json = (body: unknown, status = 200, cookie?: string) => {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (cookie) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}
const COOKIE = 'dev_session'
const sessionCookie = (token: string, maxAge = 604800) => `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`
const sessionOf = (req: Request) => {
  const token = /dev_session=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1]
  const user = token ? users.get(sessions.get(token) ?? '') : undefined
  return token && user ? { token, user } : null
}
const open = (user: User) => {
  const token = randomUUID()
  sessions.set(token, user.id)
  return json({ token, user: publicUser(user), redirect: false }, 200, sessionCookie(token))
}

const mintJwt = (u: User) => new SignJWT({ email: u.email, name: u.name, emailVerified: true }).setProtectedHeader({ alg: 'EdDSA', kid: 'dev' }).setSubject(u.id).setIssuer(new URL(APP).origin).setAudience(new URL(APP).origin).setIssuedAt().setExpirationTime('15m').sign(privateKey)

async function mockAuth(req: Request, path: string): Promise<Response> {
  if (path === '/.well-known/jwks.json') return json({ keys: [jwk] })
  if (path === '/sign-up/email' && req.method === 'POST') {
    const b = (await req.json()) as { name?: string; email?: string; password?: string }
    const email = (b.email ?? '').toLowerCase()
    if (!email || (b.password ?? '').length < 8) return json({ message: 'Password too short', code: 'PASSWORD_TOO_SHORT' }, 400)
    if ([...users.values()].some((u) => u.email === email)) return json({ message: 'User already exists. Use another email.', code: 'USER_ALREADY_EXISTS' }, 422)
    const user = { id: randomUUID(), name: b.name || email.split('@')[0], email, password: b.password! }
    users.set(user.id, user)
    return open(user)
  }
  if (path === '/sign-in/email' && req.method === 'POST') {
    const b = (await req.json()) as { email?: string; password?: string }
    const user = [...users.values()].find((u) => u.email === (b.email ?? '').toLowerCase())
    if (!user || user.password !== b.password) return json({ message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' }, 401)
    return open(user)
  }
  if (path === '/get-session') {
    const s = sessionOf(req)
    if (!s) return json(null)
    const now = Date.now()
    const body = { session: { id: s.token, token: s.token, userId: s.user.id, expiresAt: new Date(now + 604800000).toISOString(), createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }, user: publicUser(s.user) }
    // like Neon Auth: a short-lived JWT rides along with the session in a response header
    const res = json(body)
    res.headers.set('set-auth-jwt', await mintJwt(s.user))
    return res
  }
  if (path === '/sign-out' && req.method === 'POST') {
    const s = sessionOf(req)
    if (s) sessions.delete(s.token)
    return json({ success: true }, 200, sessionCookie('', 0))
  }
  if (path === '/token') {
    const s = sessionOf(req)
    if (!s) return json({ message: 'Unauthorized' }, 401)
    return json({ token: await mintJwt(s.user) })
  }
  return json({ message: 'Not found' }, 404)
}

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
    if (url.pathname.startsWith('/api/auth/')) response = await mockAuth(request, url.pathname.slice('/api/auth'.length))
    else if (url.pathname === '/api/sync' && req.method === 'POST') response = await sync.POST(request)
    else if (url.pathname === '/api/connect' && req.method === 'POST') response = await connect.POST(request)
    else if (url.pathname === '/api/account' && req.method === 'POST') {
      response = await account.POST(request)
      // the real service removes the login with the data; the mock does too
      if (response.ok) {
        const sub = decodeJwt((request.headers.get('authorization') ?? '').replace(/^Bearer /i, '')).sub
        if (sub) {
          users.delete(sub)
          for (const [token, uid] of sessions) if (uid === sub) sessions.delete(token)
        }
      }
    }
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
}).listen(PORT, () => console.log(`Lilac dev API on http://localhost:${PORT} (mock auth + in-memory database)`))
