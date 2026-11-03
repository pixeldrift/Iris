import { accountsConfigured, apiToken } from './auth'

/**
 * Web Push: gives the server this device's push address so reminders arrive when Lilac is closed.
 * Everything here fails quietly (not signed in, server not set up, browser without push): reminders still work in the app.
 */
async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const token = await apiToken()
  if (!token) return null
  const res = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  return res.ok ? ((await res.json()) as Record<string, unknown>) : null
}

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export const pushSupported = () => accountsConfigured && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined'

/** Subscribe this device (safe to repeat: it refreshes the saved address). Returns whether the server has it. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    const cfg = await call({ action: 'config' })
    const publicKey = cfg?.publicKey
    if (typeof publicKey !== 'string') return false
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }))
    const ok = await call({ action: 'subscribe', subscription: sub.toJSON(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    return !!ok
  } catch {
    return false
  }
}

/** Stop pushes to this device. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await call({ action: 'unsubscribe', endpoint: sub.endpoint })
    await sub.unsubscribe()
  } catch {
    /* nothing to undo */
  }
}
