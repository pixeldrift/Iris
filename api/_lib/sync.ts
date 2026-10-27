import type { Db } from './db.js'

export type Kind = 'task' | 'folder' | 'person'
export const KINDS: Kind[] = ['task', 'folder', 'person']

/** One entity as it travels between a device and the server. `data: null` means deleted. */
export interface Change {
  kind: Kind
  id: string
  data: Record<string, unknown> | null
  updatedAt: number
}

export interface SyncRequest {
  /** The highest server `seq` this device has already seen. */
  cursor: number
  changes: Change[]
}

export interface SyncResponse {
  changes: Change[]
  cursor: number
  /** More than one page of changes is waiting: call again with the new cursor. */
  more: boolean
}

const MAX_CHANGES = 500
const PAGE = 500
const MAX_BYTES = 64 * 1024

export class BadRequest extends Error {}

/** Check a request body, throwing BadRequest on anything unexpected. */
export function parseRequest(body: unknown): SyncRequest {
  const b = body as Partial<SyncRequest> | null
  if (!b || typeof b !== 'object') throw new BadRequest('Expected a JSON object')
  const cursor = Number(b.cursor ?? 0)
  if (!Number.isFinite(cursor) || cursor < 0) throw new BadRequest('Bad cursor')
  const list = Array.isArray(b.changes) ? b.changes : []
  if (list.length > MAX_CHANGES) throw new BadRequest(`At most ${MAX_CHANGES} changes per request`)
  const changes = list.map((c): Change => {
    if (!c || !KINDS.includes(c.kind) || typeof c.id !== 'string' || !c.id || c.id.length > 100) throw new BadRequest('Bad change')
    if (!Number.isFinite(c.updatedAt)) throw new BadRequest('Bad timestamp')
    if (c.data !== null && (typeof c.data !== 'object' || Array.isArray(c.data))) throw new BadRequest('Bad data')
    if (c.data && JSON.stringify(c.data).length > MAX_BYTES) throw new BadRequest('Entity too large')
    return { kind: c.kind, id: c.id, data: c.data, updatedAt: Math.round(c.updatedAt) }
  })
  return { cursor, changes }
}

/**
 * Apply a device's changes, then return what it hasn't seen yet.
 * Last write wins per entity: an incoming change only replaces a stored one that is not newer.
 */
export async function applySync(db: Db, userId: string, req: SyncRequest): Promise<SyncResponse> {
  for (const c of req.changes) {
    await db.query(
      `insert into entities (user_id, kind, id, data, updated_at, deleted)
       values ($1, $2, $3, $4::jsonb, $5, $6)
       on conflict (user_id, kind, id) do update
         set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = nextval('entities_seq')
         where entities.updated_at <= excluded.updated_at`,
      [userId, c.kind, c.id, c.data === null ? null : JSON.stringify(c.data), c.updatedAt, c.data === null],
    )
  }
  const { rows } = await db.query<{ kind: Kind; id: string; data: Record<string, unknown> | null; updated_at: string; seq: string }>(
    `select kind, id, data, updated_at, seq from entities where user_id = $1 and seq > $2 order by seq limit $3`,
    [userId, req.cursor, PAGE + 1],
  )
  const page = rows.slice(0, PAGE)
  return {
    changes: page.map((r) => ({ kind: r.kind, id: r.id, data: r.data, updatedAt: Number(r.updated_at) })),
    cursor: page.length ? Number(page[page.length - 1].seq) : req.cursor,
    more: rows.length > PAGE,
  }
}
