import { getPool } from './_lib/db.js'
import { applySync, BadRequest, parseRequest } from './_lib/sync.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** Turn a failure into something that tells the person setting this up what to fix (never secrets). */
function explain(e: unknown): { status: number; error: string } {
  const err = e as { code?: string; message?: string }
  const msg = err?.message ?? ''
  if (err?.code === '42P01') return { status: 503, error: 'The database tables are missing. Run db/schema.sql in the Neon SQL editor.' }
  if (msg.includes('DATABASE_URL is not set')) return { status: 503, error: 'DATABASE_URL is not set on the server.' }
  if (msg.includes('NEON_AUTH_BASE_URL')) return { status: 503, error: 'NEON_AUTH_BASE_URL is not set on the server.' }
  if (err?.code === '23503') return { status: 503, error: 'The entities table still has an old link to a user table. Re-run the latest db/schema.sql in the Neon SQL editor.' }
  if (err?.code === '28P01' || err?.code === '28000') return { status: 503, error: 'The database refused the login. Check DATABASE_URL.' }
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(err?.code ?? '') || /SSL|self[- ]signed|certificate/i.test(msg)) return { status: 503, error: `Could not reach the database (${err?.code ?? 'connection'}). Check DATABASE_URL.` }
  return { status: 500, error: 'Sync failed on the server. See the function log.' }
}

/** POST /api/sync: push this device's changes, get everyone else's. Needs a valid Neon Auth token. */
export async function POST(request: Request) {
  try {
    const who = await getVerifier().check(request)
    if (!('userId' in who)) console.warn('sync: token refused:', who.reason)
    if (!('userId' in who)) return json({ error: 'The server did not accept your sign-in token', reason: who.reason }, 401)
    const body = parseRequest(await request.json())
    return json(await applySync(getPool(), who.userId, body))
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: e.message }, 400)
    console.error('sync failed', e)
    const { status, error } = explain(e)
    return json({ error }, status)
  }
}
