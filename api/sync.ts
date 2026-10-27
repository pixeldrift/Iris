import { auth } from './_lib/auth'
import { getPool } from './_lib/db'
import { applySync, BadRequest, parseRequest } from './_lib/sync'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/sync: push this device's changes, get everyone else's. Needs a signed-in session. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return json({ error: 'Not signed in' }, 401)
  try {
    const body = parseRequest(await request.json())
    return json(await applySync(getPool(), session.user.id, body))
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: e.message }, 400)
    console.error('sync failed', e)
    return json({ error: 'Sync failed' }, 500)
  }
}
