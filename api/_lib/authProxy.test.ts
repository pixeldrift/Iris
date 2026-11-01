import { describe, expect, it } from 'vitest'
import { proxyAuth } from './authProxy'

const BASE = 'https://auth.example.neon.tech/neondb/auth'
const seen: { url?: string; init?: RequestInit } = {}
const upstream = (res: Response): typeof fetch =>
  (async (url: string, init?: RequestInit) => {
    seen.url = String(url)
    seen.init = init
    return res
  }) as unknown as typeof fetch

describe('the same-origin sign-in proxy', () => {
  it('passes the path, query, method and body to the auth service, and drops hop headers', async () => {
    const req = new Request('https://app.example.com/api/auth/sign-in/email?x=1', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.example.com', cookie: 'a=b', host: 'app.example.com', 'x-forwarded-for': '1.2.3.4' }, body: '{"email":"a@b.co"}' })
    await proxyAuth(req, BASE, upstream(new Response('{}', { status: 200 })))
    expect(seen.url).toBe('https://auth.example.neon.tech/neondb/auth/sign-in/email?x=1')
    expect(seen.init?.method).toBe('POST')
    const h = seen.init!.headers as Headers
    expect(h.get('origin')).toBe('https://app.example.com')
    expect(h.get('cookie')).toBe('a=b')
    expect(h.get('host')).toBeNull()
    expect(h.get('x-forwarded-for')).toBeNull()
    expect(new TextDecoder().decode(seen.init!.body as ArrayBuffer)).toBe('{"email":"a@b.co"}')
  })

  it('keeps every Set-Cookie but ties each to the app’s own host, and passes the JWT header along', async () => {
    const res = new Response('{}', { status: 200, headers: { 'set-auth-jwt': 'tok' } })
    res.headers.append('set-cookie', 'session=1; Path=/; Domain=auth.example.neon.tech; Secure; HttpOnly; SameSite=None')
    res.headers.append('set-cookie', 'other=2; Path=/; Secure')
    const out = await proxyAuth(new Request('https://app.example.com/api/auth/get-session'), BASE, upstream(res))
    const cookies = out.headers.getSetCookie()
    expect(cookies).toEqual(['session=1; Path=/; Secure; HttpOnly; SameSite=None', 'other=2; Path=/; Secure'])
    expect(out.headers.get('set-auth-jwt')).toBe('tok')
  })

  it('keeps a redirect on the app’s domain and sends no body for a GET', async () => {
    const res = new Response(null, { status: 302, headers: { location: 'https://auth.example.neon.tech/neondb/auth/verify?token=z' } })
    const out = await proxyAuth(new Request('https://app.example.com/api/auth/callback'), BASE, upstream(res))
    expect(out.status).toBe(302)
    expect(out.headers.get('location')).toBe('https://app.example.com/api/auth/verify?token=z')
    expect(seen.init?.body).toBeUndefined()
  })
})
