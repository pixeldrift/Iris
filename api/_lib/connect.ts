import { createHmac, randomUUID } from 'node:crypto'
import type { Db } from './db.js'
import type { Caller } from './verify.js'

/** What a person can choose to share. `name` carries first and last; `address` the line and its parts. */
export const FIELDS = ['name', 'phone', 'email', 'address', 'birthday'] as const
export type ShareField = (typeof FIELDS)[number]
const KEYS: Record<ShareField, string[]> = {
  name: ['first', 'last'],
  phone: ['phone'],
  email: ['email'],
  address: ['address', 'street', 'city', 'state', 'zip'],
  birthday: ['birthday'],
}
export type Details = Record<string, string>

export class BadRequest extends Error {}
export class TooMany extends Error {}

const MAX_INVITES_PER_DAY = 25

export const normEmail = (e: string) => e.trim().toLowerCase()

/** The keyed hash emails are matched by. Set IDENTITY_SECRET on the server; the fallback is for local development only. */
export const emailHash = (email: string) => createHmac('sha256', process.env.IDENTITY_SECRET ?? 'lilac-dev-only-secret').update(normEmail(email)).digest('hex')

const cleanShares = (v: unknown): ShareField[] => (Array.isArray(v) ? FIELDS.filter((f) => v.includes(f)) : [])

/** Only known detail keys, short strings. */
function cleanDetails(v: unknown): Details {
  const out: Details = {}
  if (!v || typeof v !== 'object') return out
  const all = Object.values(KEYS).flat()
  for (const k of all) {
    const x = (v as Record<string, unknown>)[k]
    if (typeof x === 'string' && x.trim()) out[k] = x.trim().slice(0, 200)
  }
  return out
}

/** The part of someone's details that the chosen fields allow, and nothing else. */
export function sharedView(details: Details, shares: readonly string[]): Details {
  const out: Details = {}
  for (const f of FIELDS) if (shares.includes(f)) for (const k of KEYS[f]) if (details[k]) out[k] = details[k]
  return out
}

const trustEmail = () => process.env.IDENTITY_TRUST_EMAIL === '1'

/** Create or refresh the caller's profile from their verified token (the email always comes from the token, never the client). */
export async function putProfile(db: Db, who: Caller, body: { details?: unknown; findable?: unknown } = {}) {
  const email = who.email ? normEmail(who.email) : ''
  const verified = !!email && (who.emailVerified === true || trustEmail())
  const details = body.details === undefined ? null : cleanDetails(body.details)
  const findable = typeof body.findable === 'boolean' ? body.findable : null
  await db.query(
    `insert into profiles (user_id, email, email_hash, verified, findable, details)
     values ($1, $2, $3, $4, coalesce($5, true), coalesce($6::jsonb, '{}'::jsonb))
     on conflict (user_id) do update set
       email = excluded.email, email_hash = excluded.email_hash, verified = excluded.verified,
       findable = coalesce($5, profiles.findable),
       details = coalesce($6::jsonb, profiles.details),
       updated_at = now()`,
    [who.userId, email, email ? emailHash(email) : '', verified, findable, details ? JSON.stringify(details) : null],
  )
}

interface ProfileRow {
  user_id: string
  email: string
  details: Details
}
async function profilesOf(db: Db, ids: string[]): Promise<Map<string, ProfileRow>> {
  if (!ids.length) return new Map()
  const { rows } = await db.query<ProfileRow>('select user_id, email, details from profiles where user_id = any($1)', [ids])
  return new Map(rows.map((r) => [r.user_id, r]))
}
const displayName = (p?: ProfileRow) => [p?.details?.first, p?.details?.last].filter(Boolean).join(' ') || p?.email.split('@')[0] || 'Someone'

interface ConnRow {
  id: string
  a_user: string
  b_user: string
  status: string
  ended_by: string | null
  a_shares: string[]
  b_shares: string[]
  a_person_id: string | null
  b_person_id: string | null
}

export type ConnectionView = {
  id: string
  /** pending-in: they asked you. (A request you sent is never listed: its existence would reveal that the address matched.) */
  status: 'pending-in' | 'accepted' | 'ended'
  userId: string | null
  name: string | null
  email: string | null
  myShares: ShareField[]
  theirShares: ShareField[]
  /** what they share with you, filtered here on the server: nothing else ever leaves it */
  fields: Details
  personId: string | null
  endedByMe: boolean
}

/** Everything the signed-in person's app needs: their connections, notifications and settings. */
export async function connectState(db: Db, who: Caller) {
  const me = who.userId
  const { rows } = await db.query<ConnRow>('select * from connections where a_user = $1 or b_user = $1 order by created_at', [me])
  const profiles = await profilesOf(db, [me, ...rows.map((r) => (r.a_user === me ? r.b_user : r.a_user))])
  const connections: ConnectionView[] = []
  for (const r of rows) {
    const iAmA = r.a_user === me
    const otherId = iAmA ? r.b_user : r.a_user
    const other = profiles.get(otherId)
    const mine = (iAmA ? r.a_shares : r.b_shares) as ShareField[]
    const theirs = (iAmA ? r.b_shares : r.a_shares) as ShareField[]
    const base = { id: r.id, myShares: mine, theirShares: theirs, personId: iAmA ? r.a_person_id : r.b_person_id, endedByMe: r.ended_by === me }
    if (r.status === 'accepted')
      connections.push({ ...base, status: 'accepted', userId: otherId, name: displayName(other), email: theirs.includes('email') ? other?.email ?? null : null, fields: sharedView(other?.details ?? {}, theirs) })
    else if (r.status === 'ended') connections.push({ ...base, status: 'ended', userId: otherId, name: null, email: null, fields: {} })
    else if (!iAmA && r.status === 'pending') connections.push({ ...base, status: 'pending-in', userId: otherId, name: displayName(other), email: other?.email ?? null, fields: {} })
    // a request you sent that is not yet accepted, and any declined or blocked request, is not shown at all
  }
  const notes = await db.query<{ id: string; kind: string; connection_id: string | null; from_user: string | null; read: boolean; created_at: string }>(
    'select id, kind, connection_id, from_user, read, created_at from notifications where user_id = $1 order by created_at desc limit 40',
    [me],
  )
  const senders = await profilesOf(db, notes.rows.flatMap((n) => (n.from_user ? [n.from_user] : [])))
  const mine = profiles.get(me)
  const prof = await db.query<{ findable: boolean; verified: boolean }>('select findable, verified from profiles where user_id = $1', [me])
  return {
    me: { findable: prof.rows[0]?.findable ?? true, verified: prof.rows[0]?.verified ?? false, email: mine?.email ?? who.email ?? '' },
    connections,
    notifications: notes.rows.map((n) => ({ id: n.id, kind: n.kind, connectionId: n.connection_id, from: n.from_user ? displayName(senders.get(n.from_user)) : '', read: n.read, at: n.created_at })),
    unread: notes.rows.filter((n) => !n.read).length,
  }
}

const note = (db: Db, userId: string, kind: string, connectionId: string, from: string) =>
  db.query('insert into notifications (id, user_id, kind, connection_id, from_user) values ($1, $2, $3, $4, $5)', [randomUUID(), userId, kind, connectionId, from])

/**
 * Ask someone to connect. This always answers the same way, whether or not the address belongs to anyone, so it cannot be
 * used to find out who is on Lilac. A request is only made for a verified, findable account that is not already linked.
 */
export async function invite(db: Db, who: Caller, body: { email?: unknown; personId?: unknown; shares?: unknown }) {
  const email = typeof body.email === 'string' ? normEmail(body.email) : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequest('That does not look like an email address.')
  const recent = await db.query<{ n: string }>("select count(*) as n from invite_attempts where user_id = $1 and at > now() - interval '24 hours'", [who.userId])
  if (Number(recent.rows[0]?.n ?? 0) >= MAX_INVITES_PER_DAY) throw new TooMany('Too many invitations today. Try again tomorrow.')
  await db.query('insert into invite_attempts (user_id) values ($1)', [who.userId])
  await db.query("delete from invite_attempts where at < now() - interval '7 days'")
  await putProfile(db, who) // make sure the sender has a profile (their name shows on the request)
  const target = await db.query<{ user_id: string }>('select user_id from profiles where email_hash = $1 and verified and findable and user_id <> $2 limit 1', [emailHash(email), who.userId])
  const t = target.rows[0]?.user_id
  if (!t) return { ok: true }
  const existing = await db.query<ConnRow>('select * from connections where (a_user = $1 and b_user = $2) or (a_user = $2 and b_user = $1)', [who.userId, t])
  if (existing.rows.some((r) => r.status !== 'ended')) return { ok: true } // pending, accepted, declined or blocked: nothing new to say
  await db.query('delete from connections where (a_user = $1 and b_user = $2) or (a_user = $2 and b_user = $1)', [who.userId, t])
  const id = randomUUID()
  await db.query('insert into connections (id, a_user, b_user, a_shares, a_person_id) values ($1, $2, $3, $4, $5)', [id, who.userId, t, cleanShares(body.shares), typeof body.personId === 'string' ? body.personId : null])
  await note(db, t, 'request', id, who.userId)
  return { ok: true }
}

/** Answer a request someone sent you: accept (choosing what you share back), decline, or block. */
export async function respond(db: Db, who: Caller, body: { id?: unknown; answer?: unknown; shares?: unknown; personId?: unknown }) {
  const { rows } = await db.query<ConnRow>("select * from connections where id = $1 and b_user = $2 and status = 'pending'", [String(body.id ?? ''), who.userId])
  const r = rows[0]
  if (!r) throw new BadRequest('That request is no longer waiting.')
  await putProfile(db, who)
  if (body.answer === 'accept') {
    await db.query("update connections set status = 'accepted', b_shares = $2, b_person_id = $3, updated_at = now() where id = $1", [r.id, cleanShares(body.shares), typeof body.personId === 'string' ? body.personId : null])
    await note(db, r.a_user, 'accepted', r.id, who.userId)
  } else if (body.answer === 'block' || body.answer === 'decline') {
    await db.query('update connections set status = $2, updated_at = now() where id = $1', [r.id, body.answer === 'block' ? 'blocked' : 'declined'])
  } else throw new BadRequest('Unknown answer.')
  await db.query("update notifications set read = true where user_id = $1 and connection_id = $2 and kind = 'request'", [who.userId, r.id])
  return { ok: true }
}

/** Change what you share on a connection that is live. */
export async function setShares(db: Db, who: Caller, body: { id?: unknown; shares?: unknown }) {
  const shares = cleanShares(body.shares)
  const a = await db.query("update connections set a_shares = $3, updated_at = now() where id = $1 and a_user = $2 and status = 'accepted'", [String(body.id ?? ''), who.userId, shares])
  const b = await db.query("update connections set b_shares = $3, updated_at = now() where id = $1 and b_user = $2 and status = 'accepted'", [String(body.id ?? ''), who.userId, shares])
  void a
  void b
  return { ok: true }
}

/** End a connection (or take back a request that has not been answered). Both sides keep their own address-book entries. */
export async function disconnect(db: Db, who: Caller, body: { id?: unknown }) {
  const id = String(body.id ?? '')
  await db.query("delete from connections where id = $1 and a_user = $2 and status in ('pending', 'declined', 'blocked')", [id, who.userId])
  await db.query("update connections set status = 'ended', ended_by = $2, updated_at = now() where id = $1 and (a_user = $2 or b_user = $2) and status = 'accepted'", [id, who.userId])
  return { ok: true }
}

export async function markRead(db: Db, who: Caller, body: { ids?: unknown }) {
  if (Array.isArray(body.ids) && body.ids.length) await db.query('update notifications set read = true where user_id = $1 and id = any($2)', [who.userId, body.ids.map(String)])
  else await db.query('update notifications set read = true where user_id = $1', [who.userId])
  return { ok: true }
}

/** One entry point for the API route. */
export async function handleConnect(db: Db, who: Caller, body: Record<string, unknown>) {
  switch (body.action) {
    case 'state':
      return connectState(db, who)
    case 'profile':
      await putProfile(db, who, body as { details?: unknown; findable?: unknown })
      return connectState(db, who)
    case 'invite':
      return invite(db, who, body)
    case 'respond':
      return respond(db, who, body)
    case 'shares':
      return setShares(db, who, body)
    case 'disconnect':
      return disconnect(db, who, body)
    case 'read':
      return markRead(db, who, body)
    default:
      throw new BadRequest('Unknown action.')
  }
}
