import { apiToken } from './auth'

declare const __BUILD_ID__: string

export interface Report {
  kind: 'bug' | 'idea'
  message: string
  /** Browser, screen size and the like: only when the person leaves "include details" on. */
  details: boolean
  /** The view they were on (part of the details). */
  view?: string
}

/** What "include details" shares: nothing that says who the person is. */
export function technicalDetails(view?: string): Record<string, string> {
  return {
    browser: navigator.userAgent.slice(0, 200),
    screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`,
    ...(view ? { view } : {}),
    language: navigator.language,
  }
}

/** Send a bug report or a feature idea to the app's owner. Throws a sentence the person can read. */
export async function sendFeedback(r: Report): Promise<void> {
  const token = await apiToken()
  if (!token) throw new Error('You need to be signed in to send this.')
  let res: Response
  try {
    res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: r.kind, message: r.message, build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null, context: r.details ? technicalDetails(r.view) : null }),
    })
  } catch {
    throw new Error('Couldn’t reach Lilac. Check your connection and try again.')
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Sending failed. Try again later.')
}
