import { deleteAccount } from './_lib/account.js'
import { getPool } from './_lib/db.js'
import { getVerifier } from './_lib/verify.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** POST /api/account: delete the signed-in person's data and login. The app asks for their email and password first. */
export async function POST(request: Request) {
  try {
    const who = await getVerifier().check(request)
    if (!('userId' in who)) return json({ error: 'The server did not accept your sign-in token', reason: who.reason }, 401)
    const out = await deleteAccount(getPool(), who.userId)
    return json({ deleted: true, ...out })
  } catch (e) {
    console.error('account delete failed', e)
    return json({ error: 'Could not delete the account on the server. See the function log.' }, 500)
  }
}
