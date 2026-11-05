import { getPool } from './_lib/db.js'
import { BadRequest, Forbidden, handleShare } from './_lib/share.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/share: sharing a group (create, invite, accept, roles, remove, stop, leave, assigned, state). */
export async function POST(request: Request) {
  try {
    const who = await getVerifier().check(request)
    if (!('userId' in who)) return json({ error: 'The server did not accept your sign-in token', reason: who.reason }, 401)
    const body = (await request.json()) as Record<string, unknown>
    return json(await handleShare(getPool(), who, body && typeof body === 'object' ? body : {}))
  } catch (e) {
    if (e instanceof Forbidden) return json({ error: e.message }, 403)
    if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: e.message }, 400)
    console.error('share failed', e)
    const code = (e as { code?: string })?.code
    return json({ error: code === '42P01' || code === '42703' ? 'The database needs updating. Run db/schema.sql in the Neon SQL editor.' : 'Sharing failed on the server. See the function log.' }, code === '42P01' || code === '42703' ? 503 : 500)
  }
}
