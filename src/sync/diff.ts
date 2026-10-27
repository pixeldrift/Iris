// The pure half of sync: working out what changed on this device, and what a pull should do.
// No network, no store, no DOM, so it is easy to test (and to port to the Swift app).

export type Kind = 'task' | 'folder' | 'person'

export interface Change {
  kind: Kind
  id: string
  data: Record<string, unknown> | null
  updatedAt: number
}

/** What this device last agreed on with the server. Persisted between visits. */
export interface SyncMemory {
  userId: string | null
  cursor: number
  /** key -> hash of the entity as the server last had it */
  known: Record<string, string>
  /** key -> the clock (ms) of the last change this device knows of */
  stamps: Record<string, number>
}

export const emptyMemory = (): SyncMemory => ({ userId: null, cursor: 0, known: {}, stamps: {} })

export const keyOf = (kind: Kind, id: string) => `${kind}:${id}`

/** A short, stable fingerprint of an entity's JSON (FNV-1a). Enough to notice "this changed". */
export function hashOf(data: unknown): string {
  const s = JSON.stringify(data)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36) + s.length.toString(36)
}

export interface Entity {
  kind: Kind
  id: string
  data: Record<string, unknown>
}

/**
 * Compare this device's entities with what the server last had. Returns the changes to push
 * (new or edited ones, and tombstones for ones that are gone) stamped with `now`.
 */
export function localChanges(entities: Entity[], memory: SyncMemory, now: number): { changes: Change[]; stamps: Record<string, number> } {
  const changes: Change[] = []
  const stamps = { ...memory.stamps }
  const seen = new Set<string>()
  for (const e of entities) {
    const key = keyOf(e.kind, e.id)
    seen.add(key)
    if (memory.known[key] === hashOf(e.data)) continue
    stamps[key] = now
    changes.push({ kind: e.kind, id: e.id, data: e.data, updatedAt: now })
  }
  for (const key of Object.keys(memory.known)) {
    if (seen.has(key)) continue
    const [kind, ...rest] = key.split(':')
    stamps[key] = now
    changes.push({ kind: kind as Kind, id: rest.join(':'), data: null, updatedAt: now })
  }
  return { changes, stamps }
}

/**
 * Which pulled changes to apply. A pulled change is skipped when the entity was edited here
 * after the push was prepared (`pushed` holds the hash we sent): that newer edit goes out next time.
 */
export function remoteToApply(remote: Change[], current: Map<string, string>, pushed: Map<string, string>): Change[] {
  return remote.filter((c) => {
    const key = keyOf(c.kind, c.id)
    const before = pushed.get(key)
    const now = current.get(key)
    return before === now // untouched since we looked, or both absent
  })
}
