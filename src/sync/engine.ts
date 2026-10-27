import { create } from 'zustand'
import { apiToken } from './auth'
import { normalizeFolder, normalizePerson, normalizeTask } from '../core/normalize'
import { seedData } from '../core/seed'
import { useStore } from '../state/store'
import { emptyMemory, hashOf, keyOf, localChanges, remoteToApply, type Change, type Entity, type Kind, type SyncMemory } from './diff'

export type SyncStatus = 'off' | 'syncing' | 'idle' | 'error' | 'offline'

interface SyncState {
  status: SyncStatus
  lastAt: number | null
  error: string | null
}
export const useSync = create<SyncState>(() => ({ status: 'off', lastAt: null, error: null }))

const MEMORY_KEY = 'lilac-sync-v1'

const loadMemory = (): SyncMemory => {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? { ...emptyMemory(), ...JSON.parse(raw) } : emptyMemory()
  } catch {
    return emptyMemory()
  }
}
const saveMemory = (m: SyncMemory) => {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m))
  } catch {
    /* storage full or blocked: we just re-diff next time */
  }
}

/** Everything that syncs: tasks, folders and people. (Settings and layout stay on the device.) */
function entities(): Entity[] {
  const s = useStore.getState()
  return [
    ...s.tasks.map((t): Entity => ({ kind: 'task', id: t.id, data: t as unknown as Record<string, unknown> })),
    ...s.folders.map((f): Entity => ({ kind: 'folder', id: f.id, data: f as unknown as Record<string, unknown> })),
    ...s.people.map((p): Entity => ({ kind: 'person', id: p.id, data: p as unknown as Record<string, unknown> })),
  ]
}
const hashes = () => new Map(entities().map((e) => [keyOf(e.kind, e.id), hashOf(e.data)]))

/** The ids of the built-in sample data: not worth uploading over an account that already has real data. */
function sampleKeys(): Set<string> {
  const seed = seedData()
  return new Set([...seed.tasks.map((t) => keyOf('task', t.id)), ...seed.folders.map((f) => keyOf('folder', f.id)), ...seed.people.map((p) => keyOf('person', p.id))])
}

function normalize(c: Change) {
  if (!c.data) return null
  return c.kind === 'task' ? normalizeTask(c.data) : c.kind === 'folder' ? normalizeFolder(c.data) : normalizePerson(c.data)
}

/** Fold pulled changes into the store. Returns the stored form of each (for the hash we remember). */
function applyRemote(changes: Change[]): Map<string, unknown> {
  const stored = new Map<string, unknown>()
  if (!changes.length) return stored
  const by = (k: Kind) => changes.filter((c) => c.kind === k)
  const merge = <T extends { id: string }>(list: T[], cs: Change[]): T[] => {
    if (!cs.length) return list
    const incoming = new Map(cs.map((c) => [c.id, c]))
    const have = new Set(list.map((x) => x.id))
    const out: T[] = []
    const take = (c: Change) => {
      const n = normalize(c) as T | null
      if (n) {
        stored.set(keyOf(c.kind, c.id), n)
        out.push(n)
      }
    }
    for (const x of list) {
      const c = incoming.get(x.id)
      if (c) take(c)
      else out.push(x)
    }
    for (const c of cs) if (!have.has(c.id)) take(c) // new ones go on the end
    return out
  }
  useStore.setState((s) => {
    const tasks = merge(s.tasks, by('task'))
    const folders = merge(s.folders, by('folder'))
    const people = merge(s.people, by('person'))
    const goneFolder = new Set(by('folder').filter((c) => !c.data).map((c) => c.id))
    return {
      tasks,
      folders,
      people,
      scope: s.scope.type === 'folder' && goneFolder.has(s.scope.id) ? { type: 'all' } : s.scope,
      selectedId: s.selectedId && !tasks.some((t) => t.id === s.selectedId) ? null : s.selectedId,
    }
  })
  return stored
}

async function post(body: { cursor: number; changes: Change[] }, retried = false): Promise<{ changes: Change[]; cursor: number; more: boolean }> {
  const token = await apiToken(retried)
  if (!token) throw new SignedOut()
  const res = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  if (res.status === 401) {
    if (!retried) return post(body, true) // the token may have just expired: fetch a fresh one once
    throw new SignedOut()
  }
  if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  return res.json()
}
class SignedOut extends Error {
  constructor() {
    super('Signed out')
  }
}

let running: Promise<void> | null = null
let again = false

/** Push this device's changes and pull everyone else's, once (calls made while one is running coalesce). */
export function syncNow(userId: string): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await syncOnce(userId)
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

async function syncOnce(userId: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useSync.setState({ status: 'offline' })
    return
  }
  useSync.setState({ status: 'syncing', error: null })
  try {
    let mem = loadMemory()
    if (mem.userId !== userId) {
      // first time this account is used on this device
      mem = { ...emptyMemory(), userId }
      const peek = await post({ cursor: 0, changes: [] })
      if (peek.changes.length > 0) {
        // the account already has data: the built-in samples would only be clutter on top of it
        const samples = sampleKeys()
        useStore.setState((s) => ({
          tasks: s.tasks.filter((t) => !samples.has(keyOf('task', t.id))),
          folders: s.folders.filter((f) => !samples.has(keyOf('folder', f.id))),
          people: s.people.filter((p) => !samples.has(keyOf('person', p.id))),
        }))
      }
    }
    for (;;) {
      const ents = entities()
      const { changes, stamps } = localChanges(ents, mem, Date.now())
      const pushed = hashes()
      const resp = await post({ cursor: mem.cursor, changes })
      for (const c of changes) {
        const key = keyOf(c.kind, c.id)
        if (c.data === null) delete mem.known[key]
        else mem.known[key] = pushed.get(key) ?? hashOf(c.data)
      }
      const apply = remoteToApply(resp.changes, hashes(), pushed)
      const stored = applyRemote(apply)
      for (const c of apply) {
        const key = keyOf(c.kind, c.id)
        if (c.data === null) delete mem.known[key]
        else mem.known[key] = hashOf(stored.get(key))
        stamps[key] = c.updatedAt
      }
      mem = { ...mem, cursor: resp.cursor, stamps }
      saveMemory(mem)
      if (!resp.more) break
    }
    useSync.setState({ status: 'idle', lastAt: Date.now(), error: null })
  } catch (e) {
    if (e instanceof SignedOut) {
      useSync.setState({ status: 'off', error: null })
      return
    }
    useSync.setState({ status: navigator.onLine === false ? 'offline' : 'error', error: e instanceof Error ? e.message : 'Sync failed' })
  }
}

/** Keep syncing while someone is signed in: after edits, on a timer, and when the tab comes back. */
export function startSync(userId: string): () => void {
  let timer = 0
  const soon = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void syncNow(userId), 1200)
  }
  const unsub = useStore.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks || s.folders !== prev.folders || s.people !== prev.people) soon()
  })
  const poll = window.setInterval(() => void syncNow(userId), 30_000)
  const wake = () => document.visibilityState === 'visible' && void syncNow(userId)
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
  void syncNow(userId)
  return () => {
    unsub()
    window.clearTimeout(timer)
    window.clearInterval(poll)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('online', wake)
    window.removeEventListener('focus', wake)
  }
}

/** On sign-out the account's data leaves this device, and the app goes back to its sample data. */
export function forgetAccountData() {
  try {
    localStorage.removeItem(MEMORY_KEY)
  } catch {
    /* ignore */
  }
  const seed = seedData()
  useStore.setState({ tasks: seed.tasks, folders: seed.folders, people: seed.people, scope: { type: 'all' }, selectedId: null })
  useSync.setState({ status: 'off', lastAt: null, error: null })
}
