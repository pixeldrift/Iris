import webpush from 'web-push'
import { getPool } from './_lib/db.js'
import { sweep, type Sender } from './_lib/push.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/**
 * GET /api/remind: one sweep that pushes due reminders. Something must call it about once a minute (see README,
 * "Notifications"). It needs `Authorization: Bearer $CRON_SECRET`, so nobody else can trigger it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Not allowed' }, 401)
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return json({ error: 'VAPID keys are not set' }, 503)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv)
  const send: Sender = async (sub, payload) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
      return 'ok'
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) return 'gone'
      throw e
    }
  }
  try {
    return json(await sweep(getPool(), send))
  } catch (e) {
    console.error('remind failed', e)
    return json({ error: 'Sweep failed. See the function log.' }, 500)
  }
}
