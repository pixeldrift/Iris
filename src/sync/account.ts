import { forgetAccountData } from './engine'
import { apiToken, authClient } from './auth'

/** Prove it is really them: sign in again with the email and password they just typed. Throws with a plain message. */
export async function reauthenticate(email: string, password: string): Promise<void> {
  let res: { error?: { message?: string } | null } | undefined
  try {
    res = (await authClient.signIn.email({ email, password })) as typeof res
  } catch (e) {
    // the client throws on a refused sign-in too, so only a failed network call is a connection problem
    if (/failed to fetch|network|load failed|offline/i.test(String((e as Error)?.message ?? '')) || navigator.onLine === false) throw new Error('Couldn’t reach Lilac. Check your connection and try again.')
    throw new Error('That email and password don’t match this account.')
  }
  if (res?.error) throw new Error('That email and password don’t match this account.')
}

/** Delete the signed-in account: its data and login on the server, then this device goes back to the signed-out start. */
export async function deleteMyAccount(): Promise<void> {
  const token = await apiToken(true)
  if (!token) throw new Error('You’re not signed in.')
  let res: Response
  try {
    res = await fetch('/api/account', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  } catch {
    throw new Error('Couldn’t reach Lilac. Nothing was deleted.')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'The server could not delete the account. Nothing was changed.')
  }
  await authClient.signOut().catch(() => undefined)
  forgetAccountData()
}
