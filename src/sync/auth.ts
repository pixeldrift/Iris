import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters'

/**
 * Neon Auth (managed Better Auth). The browser talks to the auth service directly; its address is
 * VITE_NEON_AUTH_URL (Neon console > Auth > Configuration > Auth URL). Without it, accounts are simply off.
 */
const url = import.meta.env.VITE_NEON_AUTH_URL as string | undefined
export const accountsConfigured = !!url
export const authClient = createAuthClient(url || 'http://localhost/accounts-not-configured', { adapter: BetterAuthReactAdapter() })

/**
 * A short-lived JWT for our own API. The Neon Auth client puts the JWT the service sends with the session
 * into `session.token` (and caches it until it nears expiry), so asking for the session is how to get it.
 * `force` skips that cache (used once after the API says the token was rejected).
 */
export async function apiToken(force = false): Promise<string | null> {
  const res = await authClient.getSession(force ? { fetchOptions: { headers: { 'X-Force-Fetch': '1' } } } : undefined)
  return res.data?.session?.token ?? null
}
