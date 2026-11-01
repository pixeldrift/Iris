/**
 * A same-origin door to Neon Auth. The browser calls /api/auth/... on the app's own domain and this passes the request
 * on to the auth service, so the session cookie it sets belongs to the app's domain: a first-party cookie.
 * Called straight, the auth service's cookie is third-party, which iPhone home-screen apps refuse to keep (sign-in
 * appears to work, then there is no session).
 */
const PREFIX = '/api/auth'
// headers that describe the hop, not the message
const SKIP_REQUEST = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-vercel-id', 'x-real-ip', 'forwarded'])
const SKIP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'])

/**
 * `rest` is the part of the path after /api/auth. When the request arrives through the rewrite in vercel.json it is carried
 * in the `p` query parameter (the rewrite sends /api/auth/x/y to /api/authproxy?p=x/y); otherwise it is read from the path.
 */
export async function proxyAuth(request: Request, base: string, send: typeof fetch = fetch): Promise<Response> {
  const incoming = new URL(request.url)
  const upstreamBase = new URL(base.replace(/\/$/, ''))
  const viaRewrite = incoming.searchParams.has('p') && incoming.pathname.endsWith('/authproxy')
  const query = new URLSearchParams(incoming.search)
  query.delete('p')
  const rest = viaRewrite ? `/${incoming.searchParams.get('p') ?? ''}` : incoming.pathname.startsWith(PREFIX) ? incoming.pathname.slice(PREFIX.length) : incoming.pathname
  const search = viaRewrite ? (query.size ? `?${query}` : '') : incoming.search
  const target = `${upstreamBase.origin}${upstreamBase.pathname.replace(/\/$/, '')}${rest}${search}`

  const headers = new Headers()
  request.headers.forEach((v, k) => {
    if (!SKIP_REQUEST.has(k.toLowerCase())) headers.set(k, v)
  })
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const upstream = await send(target, { method: request.method, headers, body: hasBody ? await request.arrayBuffer() : undefined, redirect: 'manual' })

  const out = new Headers()
  upstream.headers.forEach((v, k) => {
    if (!SKIP_RESPONSE.has(k.toLowerCase())) out.set(k, v)
  })
  // cookies: drop any Domain so each one stays with the app's own host
  const cookies = upstream.headers.getSetCookie?.() ?? []
  for (const c of cookies) out.append('set-cookie', c.replace(/;\s*domain=[^;]*/i, ''))
  // a redirect back to the auth service stays on the app's domain
  const loc = out.get('location')
  if (loc && loc.startsWith(upstreamBase.origin)) out.set('location', `${incoming.origin}${PREFIX}${loc.slice(upstreamBase.origin.length + upstreamBase.pathname.replace(/\/$/, '').length)}`)
  out.set('cache-control', out.get('cache-control') ?? 'no-store')
  // for working out where a failure is: it was this proxy, and this is what the service answered
  out.set('x-lilac-proxy', `${upstream.status} ${rest}`)
  return new Response(upstream.status === 204 || upstream.status === 304 ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}
