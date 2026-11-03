import { getPool } from './_lib/db.js'
import { BadRequest, removeSubscription, saveSubscription } from './_lib/push.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/push: { action: 'config' } gives the public key; 'subscribe' / 'unsubscribe' manage this device's push address. */
export async function POST(request: Request) {
  try {
    const who = await getVerifier().check(request)
    if (!('userId' in who)) return json({ error: 'The server did not accept your sign-in token', reason: who.reason }, 401)
    const body = (await request.json()) as Record<string, unknown>
    if (body.action === 'config') return json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null })
    if (body.action === 'subscribe') await saveSubscription(getPool(), who.userId, body)
    else if (body.action === 'unsubscribe') await removeSubscription(getPool(), who.userId, body.endpoint)
    else throw new BadRequest('Unknown action')
    return json({ ok: true })
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: (e as Error).message }, 400)
    console.error('push failed', e)
    const code = (e as { code?: string })?.code
    return json({ error: code === '42P01' ? 'The database tables are missing. Run db/schema.sql in the Neon SQL editor.' : 'Push failed on the server. See the function log.' }, code === '42P01' ? 503 : 500)
  }
}
