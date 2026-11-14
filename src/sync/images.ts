import { apiToken } from './auth'

/**
 * The sharp version of an item's pictures. An item carries a small preview (so lists, bubbles and syncing stay light); the full picture
 * is kept in this browser (IndexedDB) and, when signed in, in the account, from where other devices fetch it when it is opened.
 * Ids are random and never reused, so a cached picture never goes stale.
 */
const DB = 'lilac-images'
let opened: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('blobs')
      req.result.createObjectStore('pending')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opened
}
async function tx<T>(store: 'blobs' | 'pending', mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const r = run(d.transaction(store, mode).objectStore(store))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export const newImageId = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')

/** Keep a picture on this device; it goes up to the account on the next sync. Returns its id. */
export async function keepFull(blob: Blob): Promise<string> {
  const id = newImageId()
  await tx('blobs', 'readwrite', (s) => s.put(blob, id))
  await tx('pending', 'readwrite', (s) => s.put(1, id))
  return id
}

const urls = new Map<string, string>()

/** A URL for the sharp picture: from this device, else from the account (then kept here). null when it cannot be had (yet). */
export async function fullUrl(id: string, workspaceId?: string): Promise<string | null> {
  const known = urls.get(id)
  if (known) return known
  try {
    let blob = (await tx('blobs', 'readonly', (s) => s.get(id))) as Blob | undefined
    if (!blob) {
      const token = await apiToken()
      if (!token) return null
      const res = await fetch(`/api/image?ws=${encodeURIComponent(workspaceId ?? 'me')}&id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } })
      if (!res.ok) return null
      blob = await res.blob()
      await tx('blobs', 'readwrite', (s) => s.put(blob, id)).catch(() => undefined)
    }
    const url = URL.createObjectURL(blob)
    urls.set(id, url)
    return url
  } catch {
    return null
  }
}

/**
 * Send up the pictures that are only on this device yet. `where` says which workspace an id belongs to (an item's own, or the personal one),
 * or null when no item holds it any more (it is dropped). A failure leaves it for the next sync.
 */
export async function uploadPending(where: (id: string) => string | null | undefined): Promise<void> {
  let ids: string[]
  try {
    ids = (await tx('pending', 'readonly', (s) => s.getAllKeys())).map(String)
  } catch {
    return
  }
  for (const id of ids) {
    const ws = where(id)
    if (ws === null) {
      await tx('pending', 'readwrite', (s) => s.delete(id)).catch(() => undefined)
      continue
    }
    try {
      const blob = (await tx('blobs', 'readonly', (s) => s.get(id))) as Blob | undefined
      if (!blob) {
        await tx('pending', 'readwrite', (s) => s.delete(id))
        continue
      }
      const token = await apiToken()
      if (!token) return
      const res = await fetch(`/api/image?ws=${encodeURIComponent(ws ?? 'me')}&id=${encodeURIComponent(id)}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': blob.type || 'image/jpeg' }, body: blob })
      // sent, or refused for good (too big, not allowed): either way there is nothing more to try
      if (res.ok || [400, 403, 413, 415].includes(res.status)) await tx('pending', 'readwrite', (s) => s.delete(id))
    } catch {
      return // offline: next time
    }
  }
}
