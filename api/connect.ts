import { getPool } from './_lib/db.js'
import { BadRequest, handleConnect, TooMany } from './_lib/connect.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/connect: connections between Lilac users (profile, invite, respond, shares, disconnect, notifications). */
export async function POST(request: Request) {
  try {
    const who = await getVerifier().check(request)
    if (!('userId' in who)) return json({ error: 'The server did not accept your sign-in token', reason: who.reason }, 401)
    const body = (await request.json()) as Record<string, unknown>
    return json(await handleConnect(getPool(), who, body && typeof body === 'object' ? body : {}))
  } catch (e) {
    if (e instanceof TooMany) return json({ error: e.message }, 429)
    if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: e.message }, 400)
    console.error('connect failed', e)
    const code = (e as { code?: string })?.code
    return json({ error: code === '42P01' ? 'The database tables are missing. Run db/schema.sql in the Neon SQL editor.' : 'Connections failed on the server. See the function log.' }, code === '42P01' ? 503 : 500)
  }
}
