import type { Db } from './db.js'
import { alertLabel, dueAlerts, eventStartsFor, remindersDue } from './core.gen.js'
import type { Task } from '../../src/core/types'

export class BadRequest extends Error {}

export interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }
export interface Payload { id: string; title: string; body: string }
/** Sends one push. Resolves 'gone' when the address no longer exists (the browser was uninstalled/unsubscribed). */
export type Sender = (sub: Subscription, payload: Payload) => Promise<'ok' | 'gone'>

const text = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

export async function saveSubscription(db: Db, userId: string, body: Record<string, unknown>) {
  const s = body.subscription as Record<string, unknown> | undefined
  const keys = s?.keys as Record<string, unknown> | undefined
  const endpoint = text(s?.endpoint, 2000), p256dh = text(keys?.p256dh, 200), auth = text(keys?.auth, 100)
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith('https://')) throw new BadRequest('That is not a push subscription')
  const tz = validZone(body.timeZone) ?? 'UTC'
  await db.query(
    `insert into push_subscriptions (endpoint, user_id, p256dh, auth, tz) values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set user_id = $2, p256dh = $3, auth = $4, tz = $5`,
    [endpoint, userId, p256dh, auth, tz],
  )
}

export async function removeSubscription(db: Db, userId: string, endpoint: unknown) {
  const e = text(endpoint, 2000)
  if (!e) throw new BadRequest('No subscription given')
  await db.query('delete from push_subscriptions where endpoint = $1 and user_id = $2', [e, userId])
}

function validZone(z: unknown): string | null {
  if (typeof z !== 'string') return null
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return z } catch { return null }
}

/** Offset (ms) of a zone from UTC at a moment. */
function offsetAt(ms: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** The moment the wall clock showed these server-local fields in the person's zone. */
export function rezone(serverMs: number, tz: string): number {
  const d = new Date(serverMs)
  const guess = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())
  let t = guess - offsetAt(guess, tz)
  t = guess - offsetAt(t, tz)
  return t
}

/** A reminder is only pushed if it came due this recently (an old backlog is not worth buzzing about). */
const FRESH = 2 * 3_600_000
/** Give the open app a moment to fire (and sync) its own reminder first. */
const GRACE = 30_000

export interface Due { key: string; payload: Payload }

/** Everything that should be pushed for these tasks right now, for a person in `tz`. */
export function dueForPush(tasks: Task[], now: number, tz: string): Due[] {
  const out: Due[] = []
  for (const t of tasks) {
    for (const w of remindersDue(t, now - GRACE)) {
      const at = w === 'do' ? t.remindAt! : t.dueRemindAt!
      if (now - at > FRESH) continue
      out.push({ key: `${w}:${t.id}:${at}`, payload: { id: t.id, title: t.title || 'Reminder', body: w === 'do' ? 'Time to do this' : 'Deadline coming up' } })
    }
  }
  const startsFor = (t: Task) => eventStartsFor(t, now).map((s) => rezone(s, tz))
  for (const a of dueAlerts(tasks, now - GRACE, startsFor)) {
    out.push({ key: `a:${a.task.id}:${a.key}`, payload: { id: a.task.id, title: a.task.title || 'Event', body: a.minutes <= 0 ? 'Starting now' : `Starts in ${alertLabel(a.minutes).replace(' before', '')}` } })
  }
  return out
}

/** One sweep (run about once a minute): push whatever has come due to every subscribed person. Returns how many were sent. */
export async function sweep(db: Db, send: Sender, now = Date.now()): Promise<{ sent: number; removed: number }> {
  const subs = (await db.query<{ endpoint: string; user_id: string; p256dh: string; auth: string; tz: string }>('select endpoint, user_id, p256dh, auth, tz from push_subscriptions')).rows
  const byUser = new Map<string, typeof subs>()
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  let sent = 0, removed = 0
  for (const [userId, list] of byUser) {
    const rows = (await db.query<{ data: Task }>(
      `select e.data from entities e join workspace_members m on m.workspace_id = e.workspace_id
       where m.user_id = $1 and e.kind = 'task' and not e.deleted and e.data is not null`, [userId])).rows
    const due = dueForPush(rows.map((r) => r.data), now, list[0].tz)
    for (const d of due) {
      // claim it first: if two sweeps overlap, only one gets the row
      const claim = await db.query('insert into push_sent (user_id, key) values ($1,$2) on conflict do nothing returning key', [userId, d.key])
      if (!claim.rows.length) continue
      for (const s of list) {
        const r = await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, d.payload).catch(() => 'ok' as const)
        if (r === 'gone') { await db.query('delete from push_subscriptions where endpoint = $1', [s.endpoint]); removed++ } else sent++
      }
    }
  }
  await db.query(`delete from push_sent where sent_at < now() - interval '3 days'`)
  return { sent, removed }
}
