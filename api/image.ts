import { getPool } from './_lib/db.js'
import { getImage, ImageError, putImage } from './_lib/images.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** `ws=me` is the caller's own personal workspace (the app does not need to know its own id). */
const home = (userId: string, ws: string | null) => (ws === 'me' ? userId : ws)

async function caller(request: Request) {
  const who = await getVerifier().check(request)
  return 'userId' in who ? who : null
}
function fail(e: unknown) {
  if (e instanceof ImageError) return json({ error: e.message }, e.status)
  console.error('image failed', e)
  const code = (e as { code?: string })?.code
  return json({ error: code === '42P01' ? 'The database tables are missing. Run db/schema.sql in the Neon SQL editor.' : 'Pictures failed on the server. See the function log.' }, code === '42P01' ? 503 : 500)
}

/** GET /api/image?ws=…&id=…: a picture (cached for good by the browser: an id never changes what it shows). */
export async function GET(request: Request) {
  try {
    const who = await caller(request)
    if (!who) return json({ error: 'Not signed in' }, 401)
    const q = new URL(request.url).searchParams
    const img = await getImage(getPool(), who.userId, home(who.userId, q.get('ws')), q.get('id'))
    return new Response(img.bytes as BodyInit, { headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=31536000, immutable' } })
  } catch (e) {
    return fail(e)
  }
}

/** PUT /api/image?ws=…&id=…: the picture's bytes as the body (its type in Content-Type). */
export async function PUT(request: Request) {
  try {
    const who = await caller(request)
    if (!who) return json({ error: 'Not signed in' }, 401)
    const q = new URL(request.url).searchParams
    const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim()
    await putImage(getPool(), who.userId, home(who.userId, q.get('ws')), q.get('id'), mime, new Uint8Array(await request.arrayBuffer()))
    return json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
