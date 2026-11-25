import { getPool } from './_lib/db.js'
import { FeedbackError, notifyOwner, parseFeedback, recordIssue, saveFeedback } from './_lib/feedback.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/feedback: { kind: 'bug' | 'idea', message, build?, context? } from a signed-in person. Kept in the database, then passed on to the owner. */
export async function POST(request: Request) {
  try {
    const who = await getVerifier().check(request)
    if (!('userId' in who)) return json({ error: 'You need to be signed in to send this.', reason: who.reason }, 401)
    const input = parseFeedback(await request.json().catch(() => null))
    const db = getPool()
    const id = await saveFeedback(db, who.userId, input)
    // (the report is safe now; getting it to the owner is best effort)
    const url = await notifyOwner(id, input)
    if (url) await recordIssue(db, id, url).catch(() => undefined)
    return json({ ok: true })
  } catch (e) {
    if (e instanceof FeedbackError) return json({ error: e.message }, e.status)
    console.error('feedback failed', e)
    const code = (e as { code?: string })?.code
    return json({ error: code === '42P01' ? 'The database tables are missing. Run db/schema.sql in the Neon SQL editor.' : 'Sending failed on the server. Try again later.' }, code === '42P01' ? 503 : 500)
  }
}
