import { proxyAuth } from './_lib/authProxy.js'

const base = () => process.env.NEON_AUTH_BASE_URL ?? process.env.VITE_NEON_AUTH_URL

/** /api/auth/* (rewritten here by vercel.json): the sign-in service, reached through the app's own domain. */
async function handle(request: Request) {
  const url = base()
  if (!url) return new Response(JSON.stringify({ error: 'NEON_AUTH_BASE_URL is not set on the server.' }), { status: 503, headers: { 'content-type': 'application/json' } })
  try {
    return await proxyAuth(request, url)
  } catch (e) {
    console.error('auth proxy failed', e)
    return new Response(JSON.stringify({ error: 'Could not reach the sign-in service.' }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const OPTIONS = handle
