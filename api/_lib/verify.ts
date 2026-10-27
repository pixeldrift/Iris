import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Who is calling? The browser signs in with Neon Auth (managed Better Auth) and sends the short-lived
 * JWT it gets from `authClient.token()` as `Authorization: Bearer ...`. We check the signature against the
 * auth service's public keys (JWKS), and that the issuer is that service, then use the `sub` claim as the user id.
 */
export interface Verifier {
  userIdFrom(request: Request): Promise<string | null>
}

export function makeVerifier(keys: JWTVerifyGetKey, issuer: string): Verifier {
  return {
    async userIdFrom(request) {
      const header = request.headers.get('authorization') ?? ''
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
      if (!token) return null
      try {
        const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['EdDSA'] })
        return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
      } catch {
        return null // expired, wrong issuer, bad signature...
      }
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
