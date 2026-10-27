import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeVerifier } from './verify'

const ISSUER = 'https://auth.example.test'
let privateKey: CryptoKey
let verifier: ReturnType<typeof makeVerifier>

const sign = (claims: { sub?: string; iss?: string; exp?: string | number }, key = privateKey) => {
  const jwt = new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'k1' }).setIssuedAt().setIssuer(claims.iss ?? ISSUER).setExpirationTime(claims.exp ?? '15m')
  if (claims.sub !== undefined) jwt.setSubject(claims.sub)
  return jwt.sign(key)
}
const asking = (token?: string) => new Request('https://app.test/api/sync', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  privateKey = pair.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'EdDSA' }
  verifier = makeVerifier(createLocalJWKSet({ keys: [jwk] }), ISSUER)
})

describe('who is calling', () => {
  it('says why a token was refused', async () => {
    expect(await verifier.check(asking())).toEqual({ reason: 'no token was sent' })
    expect(await verifier.check(asking(await sign({ sub: 'u', iss: 'https://evil.test' })))).toEqual({ reason: 'ERR_JWT_CLAIM_VALIDATION_FAILED (iss)' })
    expect(await verifier.check(asking(await sign({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 60 })))).toMatchObject({ reason: expect.stringContaining('ERR_JWT_EXPIRED') })
    expect(await verifier.check(asking('opaque-session-token'))).toHaveProperty('reason')
  })
  it('accepts a good token and returns the user id', async () => {
    expect(await verifier.userIdFrom(asking(await sign({ sub: 'user-1' })))).toBe('user-1')
  })
  it('refuses missing, malformed, expired, foreign and forged tokens', async () => {
    expect(await verifier.userIdFrom(asking())).toBeNull()
    expect(await verifier.userIdFrom(asking('not.a.jwt'))).toBeNull()
    expect(await verifier.userIdFrom(asking(await sign({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 60 })))).toBeNull()
    expect(await verifier.userIdFrom(asking(await sign({ sub: 'u', iss: 'https://evil.test' })))).toBeNull()
    expect(await verifier.userIdFrom(asking(await sign({})))).toBeNull() // no subject
    const other = await generateKeyPair('EdDSA')
    expect(await verifier.userIdFrom(asking(await sign({ sub: 'u' }, other.privateKey)))).toBeNull()
  })
})
