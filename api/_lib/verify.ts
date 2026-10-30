import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Who is calling? The browser signs in with Neon Auth (managed Better Auth) and sends the short-lived
 * JWT it gets from `authClient.token()` as `Authorization: Bearer ...`. We check the signature against the
 * auth service's public keys (JWKS), and that the issuer is that service, then use the `sub` claim as the user id.
 */
export interface Verifier {
  userIdFrom(request: Request): Promise<string | null>
  /** Like userIdFrom, but says why a token was refused (safe to show: no secrets). */
  check(request: Request): Promise<Caller | { reason: string }>
}

/** A verified caller: the user id, and the email the auth service vouches for (when the token carries it). */
export interface Caller {
  userId: string
  email?: string
  /** true only when the token says the email was confirmed */
  emailVerified?: boolean
  name?: string
}

export function makeVerifier(keys: JWTVerifyGetKey, issuer: string): Verifier {
  const check = async (request: Request): Promise<Caller | { reason: string }> => {
    const header = request.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) return { reason: 'no token was sent' }
    try {
      const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['EdDSA'] })
      if (typeof payload.sub !== 'string' || !payload.sub) return { reason: 'token has no user id' }
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        emailVerified: payload.emailVerified === true || payload.email_verified === true,
        name: typeof payload.name === 'string' ? payload.name : undefined,
      }
    } catch (e) {
      // jose error codes: ERR_JWT_EXPIRED, ERR_JWT_CLAIM_VALIDATION_FAILED (issuer), ERR_JWKS_NO_MATCHING_KEY, ...
      const code = (e as { code?: string }).code ?? (e as Error).name
      const claim = (e as { claim?: string }).claim
      return { reason: `${code}${claim ? ` (${claim})` : ''}` }
    }
  }
  return {
    check,
    async userIdFrom(request) {
      const r = await check(request)
      return 'userId' in r ? r.userId : null
    },
  }
}

let shared: Verifier | null = null

/** The verifier for this deployment, configured from NEON_AUTH_BASE_URL (and NEON_AUTH_JWKS_URL if given). */
export function getVerifier(): Verifier {
  if (!shared) {
    const base = process.env.NEON_AUTH_BASE_URL ?? process.env.VITE_NEON_AUTH_URL
    if (!base) throw new Error('NEON_AUTH_BASE_URL is not set')
    const jwks = process.env.NEON_AUTH_JWKS_URL ?? `${base.replace(/\/$/, '')}/.well-known/jwks.json`
    shared = makeVerifier(createRemoteJWKSet(new URL(jwks)), new URL(base).origin)
  }
  return shared
}
