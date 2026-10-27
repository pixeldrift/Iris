import { getPool } from './_lib/db'
import { applySync, BadRequest, parseRequest } from './_lib/sync'
import { getVerifier } from './_lib/verify'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/sync: push this device's changes, get everyone else's. Needs a valid Neon Auth token. */
export async function POST(request: Request) {
  let userId: string | null
  try {
    userId = await getVerifier().userIdFrom(request)
  } catch (e) {
    console.error('auth not configured', e)
    return json({ error: 'Accounts are not configured on the server' }, 503)
  }
  if (!userId) return json({ error: 'Not signed in' }, 401)
  try {
    const body = parseRequest(await request.json())
    return json(await applySync(getPool(), userId, body))
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: e.message }, 400)
    console.error('sync failed', e)
    return json({ error: 'Sync failed' }, 500)
  }
}
