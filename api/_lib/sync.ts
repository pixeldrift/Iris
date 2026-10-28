import type { Db } from './db.js'

export type Kind = 'task' | 'folder' | 'person'
export const KINDS: Kind[] = ['task', 'folder', 'person']

/** One entity as it travels between a device and the server. `data: null` means deleted. */
export interface Change {
  kind: Kind
  id: string
  data: Record<string, unknown> | null
  updatedAt: number
  /** Which workspace it lives in. Absent = the sender's personal workspace. */
  workspaceId?: string
  /** Set by the server on the way out: who last wrote it and how many times it has been written. */
  updatedBy?: string | null
  rev?: number
}

export interface SyncRequest {
  /**
   * Just ask "has anything changed?": no changes are sent or returned, only each workspace's head counter
   * (one small read). `beat` also refreshes this device's presence and counts the other open devices.
   */
  light?: boolean
  beat?: boolean
  /** Per workspace: the highest server `seq` this device has already seen there. */
  cursors: Record<string, number>
  changes: Change[]
  /** This browser/phone. Checked in (with `active`) so the server knows who is open at once. */
  device?: { id: string; label?: string }
  /** The app is visible on this device right now. */
  active?: boolean
}

export interface WorkspaceInfo {
  id: string
  name: string
  personal: boolean
  role: 'owner' | 'editor' | 'viewer'
}

export interface SyncResponse {
  changes: Change[]
  cursors: Record<string, number>
  /** Each workspace's "something changed" counter. Anything above your cursor is news. */
  heads: Record<string, number>
  /** More than one page of changes is waiting: call again with the new cursors. */
  more: boolean
  /** Other devices (yours, or collaborators') active in your workspaces in the last minute. Light checks only refresh this on a beat. */
  peers: number | null
  workspaces: WorkspaceInfo[]
  /** Pushed changes the server refused (no such workspace, or read-only). */
  rejected: { kind: Kind; id: string; workspaceId: string }[]
}

const MAX_CHANGES = 500
const PAGE = 500
const MAX_BYTES = 64 * 1024
/** A device counts as "open" if it checked in with the app visible this recently. */
const ACTIVE_SECONDS = 60

export class BadRequest extends Error {}

const personalId = (userId: string) => userId

/** Check a request body, throwing BadRequest on anything unexpected. */
export function parseRequest(body: unknown, userId = ''): SyncRequest {
  const b = body as (Partial<SyncRequest> & { cursor?: number }) | null
  if (!b || typeof b !== 'object') throw new BadRequest('Expected a JSON object')
  const cursors: Record<string, number> = {}
  if (b.cursors && typeof b.cursors === 'object') {
    for (const [ws, c] of Object.entries(b.cursors)) {
      if (!Number.isFinite(Number(c)) || Number(c) < 0 || ws.length > 100) throw new BadRequest('Bad cursor')
      cursors[ws] = Number(c)
    }
  } else if (b.cursor !== undefined) {
    // an older client: one cursor, for the personal workspace
    if (!Number.isFinite(Number(b.cursor)) || Number(b.cursor) < 0) throw new BadRequest('Bad cursor')
    cursors[personalId(userId)] = Number(b.cursor)
  }
  const list = Array.isArray(b.changes) ? b.changes : []
  if (list.length > MAX_CHANGES) throw new BadRequest(`At most ${MAX_CHANGES} changes per request`)
  const changes = list.map((c): Change => {
    if (!c || !KINDS.includes(c.kind) || typeof c.id !== 'string' || !c.id || c.id.length > 100) throw new BadRequest('Bad change')
    if (!Number.isFinite(c.updatedAt)) throw new BadRequest('Bad timestamp')
    if (c.data !== null && (typeof c.data !== 'object' || Array.isArray(c.data))) throw new BadRequest('Bad data')
    if (c.data && JSON.stringify(c.data).length > MAX_BYTES) throw new BadRequest('Entity too large')
    if (c.workspaceId !== undefined && (typeof c.workspaceId !== 'string' || c.workspaceId.length > 100)) throw new BadRequest('Bad workspace')
    return { kind: c.kind, id: c.id, data: c.data, updatedAt: Math.round(c.updatedAt), ...(c.workspaceId ? { workspaceId: c.workspaceId } : {}) }
  })
  let device: SyncRequest['device']
  if (b.device) {
    if (typeof b.device.id !== 'string' || !b.device.id || b.device.id.length > 100) throw new BadRequest('Bad device')
    device = { id: b.device.id, label: typeof b.device.label === 'string' ? b.device.label.slice(0, 60) : '' }
  }
  return { cursors, changes, device, active: !!b.active, light: !!b.light, beat: !!b.beat }
}

async function ensureHome(db: Db, userId: string) {
  // everyone has a personal workspace; make sure it exists
  await db.query(`insert into workspaces (id, name, personal) values ($1, '', true) on conflict (id) do nothing`, [personalId(userId)])
  await db.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $1, 'owner') on conflict do nothing`, [personalId(userId)])
}

/** The workspaces this person belongs to, with each one's head counter: a single small read. */
async function membership(db: Db, userId: string) {
  const { rows } = await db.query<{ id: string; name: string; personal: boolean; role: WorkspaceInfo['role']; head_seq: string }>(
    `select w.id, w.name, w.personal, m.role, w.head_seq from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = $1 order by w.personal desc, w.created_at`,
    [userId],
  )
  const workspaces: WorkspaceInfo[] = rows.map(({ id, name, personal, role }) => ({ id, name, personal, role }))
  const heads: Record<string, number> = {}
  for (const r of rows) heads[r.id] = Number(r.head_seq)
  return { workspaces, heads }
}

async function checkIn(db: Db, userId: string, req: SyncRequest): Promise<number> {
  if (req.device && req.active) {
    await db.query(
      `insert into devices (user_id, device_id, label, last_seen) values ($1, $2, $3, now())
       on conflict (user_id, device_id) do update set last_seen = now(), label = excluded.label`,
      [userId, req.device.id, req.device.label ?? ''],
    )
  }
  const { rows } = await db.query<{ n: string }>(
    `select count(*) as n from devices d
      where d.last_seen > now() - ($3 || ' seconds')::interval
        and not (d.user_id = $1 and d.device_id = $2)
        and d.user_id in (select user_id from workspace_members where workspace_id in (select workspace_id from workspace_members where user_id = $1))`,
    [userId, req.device?.id ?? '', String(ACTIVE_SECONDS)],
  )
  return Number(rows[0]?.n ?? 0)
}

/**
 * "Has anything changed?" in one read. This is what a device polls while it waits for news; only when a head
 * is above its cursor does it do a full sync. (`beat` adds the presence write and peer count, done every so often.)
 */
export async function lightCheck(db: Db, userId: string, req: SyncRequest): Promise<SyncResponse> {
  let { workspaces, heads } = await membership(db, userId)
  if (!workspaces.length) {
    await ensureHome(db, userId)
    ;({ workspaces, heads } = await membership(db, userId))
  }
  const peers = req.beat ? await checkIn(db, userId, req) : null
  return { changes: [], cursors: req.cursors, heads, more: false, peers, workspaces, rejected: [] }
}

/**
 * Apply a device's changes, then return what it hasn't seen yet, across every workspace the person belongs to.
 * Last write wins per entity: an incoming change only replaces a stored one that is not newer.
 *
 * Each write bumps its workspace's head counter in the same statement, so `seq` numbers are gapless and appear in
 * commit order: a device that has pulled up to the head has everything, with no way to skip a row that was still
 * being committed.
 */
export async function applySync(db: Db, userId: string, req: SyncRequest): Promise<SyncResponse> {
  if (req.light) return lightCheck(db, userId, req)
  await ensureHome(db, userId)
  const { workspaces } = await membership(db, userId)
  const roles = new Map(workspaces.map((w) => [w.id, w.role]))
  const peers = await checkIn(db, userId, req)

  const rejected: SyncResponse['rejected'] = []
  for (const c of req.changes) {
    const ws = c.workspaceId ?? personalId(userId)
    const role = roles.get(ws)
    if (!role || role === 'viewer') {
      rejected.push({ kind: c.kind, id: c.id, workspaceId: ws })
      continue
    }
    await db.query(
      `with bump as (update workspaces set head_seq = head_seq + 1 where id = $1 returning head_seq)
       insert into entities (workspace_id, kind, id, data, updated_at, updated_by, deleted, seq)
       select $1, $2, $3, $4::jsonb, $5, $6, $7, bump.head_seq from bump
       on conflict (workspace_id, kind, id) do update
         set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = excluded.deleted,
             rev = entities.rev + 1, seq = excluded.seq
         where entities.updated_at <= excluded.updated_at`,
      [ws, c.kind, c.id, c.data === null ? null : JSON.stringify(c.data), c.updatedAt, userId, c.data === null],
    )
  }

  // heads are read after the writes, and before the rows: everything at or below a head is already committed
  const { workspaces: after, heads } = await membership(db, userId)
  const ids = after.map((w) => w.id)
  const cursors: Record<string, number> = {}
  for (const id of ids) cursors[id] = req.cursors[id] ?? 0
  const { rows } = await db.query<{ workspace_id: string; kind: Kind; id: string; data: Record<string, unknown> | null; updated_at: string; updated_by: string | null; rev: string; seq: string }>(
    `select e.workspace_id, e.kind, e.id, e.data, e.updated_at, e.updated_by, e.rev, e.seq
       from entities e join unnest($1::text[], $2::bigint[]) as c(ws, cur) on e.workspace_id = c.ws and e.seq > c.cur
      order by e.workspace_id, e.seq limit $3`,
    [ids, ids.map((id) => cursors[id]), PAGE + 1],
  )
  const page = rows.slice(0, PAGE)
  const more = rows.length > PAGE
  for (const r of page) cursors[r.workspace_id] = Math.max(cursors[r.workspace_id], Number(r.seq))
  // caught up: the cursor can go straight to the head (a bump with no row, from a refused older write, leaves a gap)
  if (!more) for (const id of ids) cursors[id] = Math.max(cursors[id], heads[id] ?? 0)

  return {
    changes: page.map((r) => ({ workspaceId: r.workspace_id, kind: r.kind, id: r.id, data: r.data, updatedAt: Number(r.updated_at), updatedBy: r.updated_by, rev: Number(r.rev) })),
    cursors,
    heads,
    more,
    peers,
    workspaces: after,
    rejected,
  }
}
