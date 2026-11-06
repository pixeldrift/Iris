import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Db } from './db.js'
import type { Caller } from './verify.js'

/**
 * Sharing a group. Each shared group is its own workspace: its members and their roles live in `workspace_members`, and the
 * group's tasks are entities in that workspace (the app moves them there). Everything here is about people and permission;
 * the data itself travels through /api/sync, which already checks roles on every write.
 *
 * Leaving: when the owner stops sharing or removes someone they choose whether that person may keep a copy. If not, the
 * membership ends at once. If so, the person becomes a read-only "leaving" member and is told; they choose to keep a copy
 * (the app copies the group into their own space first) or let it go, and then leave.
 */
export class BadRequest extends Error {}
export class Forbidden extends Error {}

export type Role = 'owner' | 'editor' | 'viewer'
const INVITE_DAYS = 14
const MAX_NAME = 100

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null)
const idOf = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : null)
const roleOfInput = (v: unknown): 'editor' | 'viewer' => (v === 'viewer' ? 'viewer' : 'editor')
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

interface Membership {
  role: Role
  status: 'active' | 'leaving'
  can_copy: boolean
}

async function membership(db: Db, workspaceId: string, userId: string): Promise<Membership | null> {
  const { rows } = await db.query<Membership>('select role, status, can_copy from workspace_members where workspace_id = $1 and user_id = $2', [workspaceId, userId])
  return rows[0] ?? null
}

/** The caller must own this (shared, not personal) workspace. */
async function asOwner(db: Db, workspaceId: string, userId: string) {
  const { rows } = await db.query<{ name: string; personal: boolean }>('select name, personal from workspaces where id = $1', [workspaceId])
  const m = await membership(db, workspaceId, userId)
  if (!rows[0] || rows[0].personal || !m || m.role !== 'owner') throw new Forbidden('Only the owner of a shared group can do that.')
  return rows[0]
}

async function displayNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const { rows } = await db.query<{ user_id: string; email: string; details: Record<string, string> | null }>('select user_id, email, details from profiles where user_id = any($1::text[])', [ids])
  for (const r of rows) out.set(r.user_id, [r.details?.first, r.details?.last].filter(Boolean).join(' ') || r.email.split('@')[0] || 'Someone')
  return out
}

const notify = (db: Db, to: string, kind: string, workspaceId: string, from: string, info: string, extra = '') =>
  db.query('insert into notifications (id, user_id, kind, workspace_id, from_user, info, extra) values ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), to, kind, workspaceId, from, info, extra])

/** Make a group shareable: a new workspace owned by the caller. (The app then moves the group and its tasks into it.) */
export async function createShare(db: Db, who: Caller, body: { name?: unknown; rootFolderId?: unknown }) {
  const name = text(body.name, MAX_NAME)
  const root = idOf(body.rootFolderId)
  if (!name || !root) throw new BadRequest('A group to share is needed.')
  const exists = await db.query('select 1 from workspaces w join workspace_members m on m.workspace_id = w.id where m.user_id = $1 and m.role = $2 and w.root_folder_id = $3', [who.userId, 'owner', root])
  if (exists.rows.length) throw new BadRequest('That group is already shared.')
  const id = randomUUID()
  await db.query('insert into workspaces (id, name, personal, root_folder_id) values ($1, $2, false, $3)', [id, name, root])
  await db.query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')", [id, who.userId])
  return { workspaceId: id }
}

/** Invite someone you are connected with: they get a notification and decide. */
export async function inviteConnection(db: Db, who: Caller, body: { workspaceId?: unknown; toUserId?: unknown; role?: unknown }) {
  const ws = idOf(body.workspaceId)
  const to = idOf(body.toUserId)
  if (!ws || !to) throw new BadRequest('Who to invite is needed.')
  const w = await asOwner(db, ws, who.userId)
  const linked = await db.query("select 1 from connections where status = 'accepted' and ((a_user = $1 and b_user = $2) or (a_user = $2 and b_user = $1))", [who.userId, to])
  if (!linked.rows.length) throw new Forbidden('You can invite people you are connected with.')
  if (await membership(db, ws, to)) throw new BadRequest('They are already in this group.')
  const open = await db.query('select 1 from workspace_invites where workspace_id = $1 and to_user = $2 and not used and expires_at > now()', [ws, to])
  if (!open.rows.length) {
    await db.query("insert into workspace_invites (id, workspace_id, role, created_by, to_user, expires_at) values ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)", [randomUUID(), ws, roleOfInput(body.role), who.userId, to, String(INVITE_DAYS)])
    await notify(db, to, 'share-invite', ws, who.userId, w.name)
  }
  return { ok: true }
}

/** A link anyone can use once. The token is returned only here, and only its hash is kept. */
export async function inviteLink(db: Db, who: Caller, body: { workspaceId?: unknown; role?: unknown }) {
  const ws = idOf(body.workspaceId)
  if (!ws) throw new BadRequest('A group is needed.')
  await asOwner(db, ws, who.userId)
  const token = randomBytes(24).toString('base64url')
  await db.query("insert into workspace_invites (id, workspace_id, role, created_by, token_hash, expires_at) values ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)", [randomUUID(), ws, roleOfInput(body.role), who.userId, hashToken(token), String(INVITE_DAYS)])
  return { token }
}

/** Accept an invitation (by its id, from a notification, or by a link's token). */
export async function accept(db: Db, who: Caller, body: { inviteId?: unknown; token?: unknown }) {
  const byId = idOf(body.inviteId)
  const token = typeof body.token === 'string' && body.token.length <= 200 ? body.token : null
  if (!byId && !token) throw new BadRequest('Which invitation?')
  const { rows } = byId
    ? await db.query<{ id: string; workspace_id: string; role: 'editor' | 'viewer'; created_by: string; to_user: string | null }>('select id, workspace_id, role, created_by, to_user from workspace_invites where id = $1 and not used and expires_at > now()', [byId])
    : await db.query<{ id: string; workspace_id: string; role: 'editor' | 'viewer'; created_by: string; to_user: string | null }>('select id, workspace_id, role, created_by, to_user from workspace_invites where token_hash = $1 and not used and expires_at > now()', [hashToken(token!)])
  const inv = rows[0]
  if (!inv || (inv.to_user && inv.to_user !== who.userId)) throw new BadRequest('That invitation is no longer valid.')
  await db.query("insert into workspace_members (workspace_id, user_id, role) values ($1,$2,$3) on conflict (workspace_id, user_id) do update set role = excluded.role, status = 'active', can_copy = false", [inv.workspace_id, who.userId, inv.role])
  await db.query('update workspace_invites set used = true where id = $1', [inv.id])
  const w = await db.query<{ name: string }>('select name from workspaces where id = $1', [inv.workspace_id])
  await notify(db, inv.created_by, 'share-joined', inv.workspace_id, who.userId, w.rows[0]?.name ?? '')
  return { workspaceId: inv.workspace_id, name: w.rows[0]?.name ?? '' }
}

export async function decline(db: Db, who: Caller, body: { inviteId?: unknown }) {
  const id = idOf(body.inviteId)
  if (!id) throw new BadRequest('Which invitation?')
  await db.query('delete from workspace_invites where id = $1 and to_user = $2', [id, who.userId])
  return { ok: true }
}

export async function setRole(db: Db, who: Caller, body: { workspaceId?: unknown; userId?: unknown; role?: unknown }) {
  const ws = idOf(body.workspaceId)
  const user = idOf(body.userId)
  if (!ws || !user) throw new BadRequest('Whose role?')
  await asOwner(db, ws, who.userId)
  if (user === who.userId) throw new BadRequest('You own this group.')
  await db.query("update workspace_members set role = $3 where workspace_id = $1 and user_id = $2 and role <> 'owner' and status = 'active'", [ws, user, roleOfInput(body.role)])
  return { ok: true }
}

/** End someone's membership as the owner chooses: gone at once, or read-only until they decide whether to keep a copy. */
async function endMembership(db: Db, ws: string, name: string, owner: string, user: string, allowCopy: boolean) {
  if (allowCopy) await db.query("update workspace_members set status = 'leaving', can_copy = true, role = 'viewer' where workspace_id = $1 and user_id = $2", [ws, user])
  else await db.query('delete from workspace_members where workspace_id = $1 and user_id = $2', [ws, user])
  await notify(db, user, 'share-removed', ws, owner, name, allowCopy ? 'copy' : 'none')
}

export async function remove(db: Db, who: Caller, body: { workspaceId?: unknown; userId?: unknown; allowCopy?: unknown }) {
  const ws = idOf(body.workspaceId)
  const user = idOf(body.userId)
  if (!ws || !user) throw new BadRequest('Who to remove?')
  const w = await asOwner(db, ws, who.userId)
  if (user === who.userId) throw new BadRequest('You own this group: stop sharing it instead.')
  const m = await membership(db, ws, user)
  if (!m) return { ok: true }
  await endMembership(db, ws, w.name, who.userId, user, body.allowCopy === true)
  return { ok: true }
}

/** Stop sharing with everyone, choosing whether they may keep a copy. The owner keeps the group. */
export async function stop(db: Db, who: Caller, body: { workspaceId?: unknown; allowCopy?: unknown }) {
  const ws = idOf(body.workspaceId)
  if (!ws) throw new BadRequest('Which group?')
  const w = await asOwner(db, ws, who.userId)
  const others = await db.query<{ user_id: string }>("select user_id from workspace_members where workspace_id = $1 and role <> 'owner'", [ws])
  for (const o of others.rows) await endMembership(db, ws, w.name, who.userId, o.user_id, body.allowCopy === true)
  await db.query('delete from workspace_invites where workspace_id = $1 and not used', [ws])
  return { ended: others.rows.length }
}

/** Leave a group (also how a "leaving" member lets it go, once they have kept a copy or decided not to). */
export async function leave(db: Db, who: Caller, body: { workspaceId?: unknown }) {
  const ws = idOf(body.workspaceId)
  if (!ws) throw new BadRequest('Which group?')
  const m = await membership(db, ws, who.userId)
  if (!m) return { ok: true }
  if (m.role === 'owner') throw new BadRequest('You own this group: stop sharing it instead.')
  const w = await db.query<{ name: string }>('select name from workspaces where id = $1', [ws])
  await db.query('delete from workspace_members where workspace_id = $1 and user_id = $2', [ws, who.userId])
  const owner = await db.query<{ user_id: string }>("select user_id from workspace_members where workspace_id = $1 and role = 'owner'", [ws])
  // a person who was removed already knows: only tell the owner about someone who chose to go
  if (m.status === 'active' && owner.rows[0]) await notify(db, owner.rows[0].user_id, 'share-left', ws, who.userId, w.rows[0]?.name ?? '')
  return { ok: true }
}

/**
 * Close a shared group for good, once the owner is the only one left in it (everyone has been removed or has let it go, and the group
 * has come home to the owner). Sharing the group again then starts a fresh one, rather than reviving this empty shell.
 */
export async function retire(db: Db, who: Caller, body: { workspaceId?: unknown }) {
  const ws = idOf(body.workspaceId)
  if (!ws) throw new BadRequest('Which group?')
  await asOwner(db, ws, who.userId)
  const others = await db.query("select 1 from workspace_members where workspace_id = $1 and role <> 'owner'", [ws])
  if (others.rows.length) throw new Forbidden('There are still people in this group.')
  await db.query('delete from workspaces where id = $1', [ws])
  return { ok: true }
}

/** Tell the other members that a task was added to a shared group (the app only asks when the person has switched this on). */
export async function notifyAdded(db: Db, who: Caller, body: { workspaceId?: unknown; taskId?: unknown; title?: unknown }) {
  const ws = idOf(body.workspaceId)
  const taskId = idOf(body.taskId)
  if (!ws || !taskId) return { ok: true }
  const mine = await membership(db, ws, who.userId)
  if (!mine || mine.role === 'viewer') throw new Forbidden('You can add to a group you can edit.')
  const title = typeof body.title === 'string' ? body.title.slice(0, 120) : ''
  const others = await db.query<{ user_id: string }>("select user_id from workspace_members where workspace_id = $1 and user_id <> $2 and status = 'active'", [ws, who.userId])
  for (const o of others.rows) await notify(db, o.user_id, 'task-added', ws, who.userId, title, taskId)
  return { ok: true }
}

/** Tell a member a task was given to them. (Both must be in the group; the app calls this when an assignee is set.) */
export async function notifyAssigned(db: Db, who: Caller, body: { workspaceId?: unknown; userId?: unknown; taskId?: unknown; title?: unknown }) {
  const ws = idOf(body.workspaceId)
  const to = idOf(body.userId)
  const taskId = idOf(body.taskId)
  if (!ws || !to || !taskId || to === who.userId) return { ok: true }
  const mine = await membership(db, ws, who.userId)
  const theirs = await membership(db, ws, to)
  if (!mine || mine.role === 'viewer' || !theirs || theirs.status !== 'active') throw new Forbidden('You can give tasks to people in a group you can edit.')
  const title = typeof body.title === 'string' ? body.title.slice(0, 120) : ''
  await notify(db, to, 'assigned', ws, who.userId, title, taskId)
  return { ok: true }
}

export interface ShareView {
  workspaceId: string
  name: string
  rootFolderId: string | null
  role: Role
  status: 'active' | 'leaving'
  canCopy: boolean
  members: { userId: string; name: string; role: Role; status: 'active' | 'leaving'; /** has the app open right now (seen in the last minute) */ active: boolean }[]
  /** invitations still waiting (owner only) */
  pending: number
}

/** Everything about the caller's sharing: the groups they share or are in, invitations waiting for them, and news. */
export async function shareState(db: Db, who: Caller) {
  const mine = await db.query<{ id: string; name: string; root_folder_id: string | null; role: Role; status: 'active' | 'leaving'; can_copy: boolean }>(
    'select w.id, w.name, w.root_folder_id, m.role, m.status, m.can_copy from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = $1 and not w.personal order by w.created_at',
    [who.userId],
  )
  const ids = mine.rows.map((r) => r.id)
  const mem = ids.length
    ? await db.query<{ workspace_id: string; user_id: string; role: Role; status: 'active' | 'leaving' }>('select workspace_id, user_id, role, status from workspace_members where workspace_id = any($1::text[])', [ids])
    : { rows: [] as { workspace_id: string; user_id: string; role: Role; status: 'active' | 'leaving' }[] }
  const inv = await db.query<{ id: string; workspace_id: string; role: string; created_by: string; name: string }>(
    'select i.id, i.workspace_id, i.role, i.created_by, w.name from workspace_invites i join workspaces w on w.id = i.workspace_id where i.to_user = $1 and not i.used and i.expires_at > now() order by i.created_at desc',
    [who.userId],
  )
  const pending = ids.length ? await db.query<{ workspace_id: string; n: string }>('select workspace_id, count(*) as n from workspace_invites where workspace_id = any($1::text[]) and not used and expires_at > now() group by workspace_id', [ids]) : { rows: [] as { workspace_id: string; n: string }[] }
  const news = await db.query<{ id: string; kind: string; workspace_id: string | null; from_user: string | null; info: string | null; extra: string | null; read: boolean; created_at: string }>(
    "select id, kind, workspace_id, from_user, info, extra, read, created_at from notifications where user_id = $1 and kind like any(array['share-%', 'assigned', 'task-added']) order by created_at desc limit 40",
    [who.userId],
  )
  // who has the app open right now: a device of theirs checked in with the app visible in the last minute
  const live = new Set(
    (await db.query<{ user_id: string }>("select distinct user_id from devices where last_seen > now() - interval '60 seconds' and user_id = any($1::text[])", [[...new Set(mem.rows.map((m) => m.user_id))]])).rows.map((r) => r.user_id),
  )
  const names = await displayNames(db, [...new Set([...mem.rows.map((m) => m.user_id), ...inv.rows.map((i) => i.created_by), ...news.rows.flatMap((n) => (n.from_user ? [n.from_user] : []))])])
  const nameOf = (id: string) => names.get(id) ?? 'Someone'
  const shares: ShareView[] = mine.rows.map((r) => ({
    workspaceId: r.id,
    name: r.name,
    rootFolderId: r.root_folder_id,
    role: r.role,
    status: r.status,
    canCopy: r.can_copy,
    members: mem.rows.filter((m) => m.workspace_id === r.id).map((m) => ({ userId: m.user_id, name: m.user_id === who.userId ? 'You' : nameOf(m.user_id), role: m.role, status: m.status, active: live.has(m.user_id) })),
    pending: r.role === 'owner' ? Number(pending.rows.find((p) => p.workspace_id === r.id)?.n ?? 0) : 0,
  }))
  return {
    me: who.userId,
    shares,
    invites: inv.rows.map((i) => ({ id: i.id, workspaceId: i.workspace_id, name: i.name, from: nameOf(i.created_by), role: i.role })),
    news: news.rows.map((n) => ({ id: n.id, kind: n.kind, workspaceId: n.workspace_id, from: n.from_user ? nameOf(n.from_user) : '', info: n.info ?? '', extra: n.extra ?? '', read: n.read, at: n.created_at })),
  }
}

/** Clear one piece of news (or all of it): sharing news and assignments, never an invitation that still waits for an answer. */
export async function clearShareNews(db: Db, who: Caller, body: { id?: unknown }) {
  const id = idOf(body.id)
  if (id) await db.query("delete from notifications where id = $1 and user_id = $2 and (kind like 'share-%' or kind in ('assigned', 'task-added')) and kind <> 'share-invite'", [id, who.userId])
  else await db.query("delete from notifications where user_id = $1 and (kind like 'share-%' or kind in ('assigned', 'task-added')) and kind <> 'share-invite'", [who.userId])
  return { ok: true }
}

export async function markShareNewsRead(db: Db, who: Caller) {
  await db.query("update notifications set read = true where user_id = $1 and (kind like 'share-%' or kind in ('assigned', 'task-added'))", [who.userId])
  return { ok: true }
}

export async function handleShare(db: Db, who: Caller, body: Record<string, unknown>) {
  switch (body.action) {
    case 'state': return shareState(db, who)
    case 'create': return createShare(db, who, body)
    case 'invite': return inviteConnection(db, who, body)
    case 'link': return inviteLink(db, who, body)
    case 'accept': return accept(db, who, body)
    case 'decline': return decline(db, who, body)
    case 'role': return setRole(db, who, body)
    case 'remove': return remove(db, who, body)
    case 'stop': return stop(db, who, body)
    case 'leave': return leave(db, who, body)
    case 'assigned': return notifyAssigned(db, who, body)
    case 'added': return notifyAdded(db, who, body)
    case 'retire': return retire(db, who, body)
    case 'read': return markShareNewsRead(db, who)
    case 'clear': return clearShareNews(db, who, body)
    default: throw new BadRequest('Unknown action')
  }
}
