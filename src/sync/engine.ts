import { create } from 'zustand'
import { drop } from '../audio/engine'
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
  /** Other devices (yours or a collaborator's) open at the same moment. */
  peers: number
}
export const useSync = create<SyncState>(() => ({ status: 'off', lastAt: null, error: null, peers: 0 }))

const MEMORY_KEY = 'lilac-sync-v1'

const loadMemory = (): SyncMemory => {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return emptyMemory()
    const m = { ...emptyMemory(), ...JSON.parse(raw) } as SyncMemory & { cursor?: number }
    // the first version kept one cursor, for what is now the personal workspace
    if (typeof m.cursor === 'number' && m.userId && !Object.keys(m.cursors).length) m.cursors = { [m.userId]: m.cursor }
    delete m.cursor
    return m
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
  const mk = (kind: Entity['kind'], x: { id: string; workspaceId?: string }): Entity => ({ kind, id: x.id, data: x as unknown as Record<string, unknown>, ...(x.workspaceId ? { workspaceId: x.workspaceId } : {}) })
  return [...s.tasks.map((t) => mk('task', t)), ...s.folders.map((f) => mk('folder', f)), ...s.people.map((p) => mk('person', p))]
}

/** This browser, as the server knows it (to tell when two are open at once). */
function deviceInfo(): { id: string; label: string } {
  let id = ''
  try {
    id = localStorage.getItem('lilac-device') ?? ''
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem('lilac-device', id)
    }
  } catch {
    id = 'ephemeral-' + Math.random().toString(36).slice(2)
  }
  const ua = navigator.userAgent
  const label = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Browser'
  return { id, label }
}
const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
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

interface Reply {
  changes: Change[]
  cursors: Record<string, number>
  /** Each workspace's "something changed" counter: above your cursor means news. */
  heads: Record<string, number>
  more: boolean
  peers?: number | null
  rejected?: { kind: string; id: string; workspaceId: string }[]
}

async function post(body: { cursors: Record<string, number>; changes: Change[]; device?: { id: string; label: string }; active?: boolean; light?: boolean; beat?: boolean }, retried = false): Promise<Reply> {
  const token = await apiToken(retried)
  if (!token) throw new SignedOut()
  const res = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  if (res.status === 401 && !retried) return post(body, true) // the token may have just expired: fetch a fresh one once
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string; reason?: string } | null
    throw new Error(detail?.error ? `${detail.error}${detail.reason ? ` (${detail.reason})` : ''}` : res.status === 404 ? 'The sync API was not found (/api/sync returned 404)' : `Sync failed (HTTP ${res.status})`)
  }
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
  const device = deviceInfo()
  try {
    let mem = loadMemory()
    const returning = mem.userId === userId // not the first sync of this account on this device
    if (!returning) {
      // first time this account is used on this device
      mem = { ...emptyMemory(), userId }
      const peek = await post({ cursors: {}, changes: [], device, active: isVisible() })
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
      const resp = await post({ cursors: mem.cursors, changes, device, active: isVisible() })
      const rejected = new Set((resp.rejected ?? []).map((r) => keyOf(r.kind as Kind, r.id)))
      for (const c of changes) {
        const key = keyOf(c.kind, c.id)
        // (a refused change is dropped quietly for now: there is no way to share yet, so it cannot really happen)
        if (c.data === null) delete mem.known[key]
        else mem.known[key] = pushed.get(key) ?? hashOf(c.data)
        if (c.workspaceId && !rejected.has(key)) mem.wsOf[key] = c.workspaceId
      }
      const apply = remoteToApply(resp.changes, hashes(), pushed)
      // things another device just added: they arrive with a drop and a ripple, like something you placed yourself
      const have = new Set(useStore.getState().tasks.map((t) => t.id))
      const arrived = returning ? apply.filter((c) => c.kind === 'task' && c.data && !have.has(c.id)).map((c) => c.id) : []
      const stored = applyRemote(apply)
      for (const c of apply) {
        const key = keyOf(c.kind, c.id)
        if (c.data === null) delete mem.known[key]
        else mem.known[key] = hashOf(stored.get(key))
        if (c.workspaceId && c.workspaceId !== userId) mem.wsOf[key] = c.workspaceId
        stamps[key] = c.updatedAt
      }
      mem = { ...mem, cursors: { ...mem.cursors, ...resp.cursors }, stamps }
      saveMemory(mem)
      useSync.setState({ peers: resp.peers ?? 0 })
      lastBeat = Date.now() // a full sync checks in too
      if (arrived.length && isVisible()) announceArrivals(arrived)
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

/** A drop of water for something that just arrived from another device (a few at most: a burst is one splash). */
function announceArrivals(ids: string[]) {
  drop(0)
  for (const id of ids.slice(0, 3)) window.dispatchEvent(new CustomEvent('lilac:added', { detail: { id } }))
}

/**
 * How often to ask. A check is one small read of a counter ("has anything changed?"), so it can be frequent:
 * about once a second while another device is open at the same moment, calmly otherwise.
 */
const FAST_MS = 1000
const CALM_MS = 15_000
const HIDDEN_MS = 45_000
/** How often a device checks in (presence) and re-counts the others. */
const BEAT_MS = 15_000

let lastBeat = 0

/**
 * The cheap question: has any workspace moved past what this device has seen? Only if so is there a full sync.
 * Also checks in now and then (a beat) so other devices know this one is open.
 */
async function poll(userId: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useSync.setState({ status: 'offline' })
    return
  }
  const mem = loadMemory()
  if (mem.userId !== userId) return syncNow(userId) // never synced here yet
  const beat = Date.now() - lastBeat > BEAT_MS
  try {
    const resp = await post({ cursors: mem.cursors, changes: [], light: true, beat, device: deviceInfo(), active: isVisible() })
    if (beat) {
      lastBeat = Date.now()
      if (typeof resp.peers === 'number') useSync.setState({ peers: resp.peers })
    }
    const news = Object.entries(resp.heads).some(([ws, head]) => head > (mem.cursors[ws] ?? 0))
    if (news) return syncNow(userId)
    useSync.setState({ status: 'idle', lastAt: Date.now(), error: null })
  } catch (e) {
    if (e instanceof SignedOut) return useSync.setState({ status: 'off', error: null })
    useSync.setState({ status: navigator.onLine === false ? 'offline' : 'error', error: e instanceof Error ? e.message : 'Sync failed' })
  }
}

/**
 * Keep syncing while someone is signed in: a moment after any edit, when the app comes back into view, and by
 * asking the cheap question on a timer whose pace depends on whether another device is open right now.
 */
export function startSync(userId: string): () => void {
  let edit = 0
  let loop = 0
  let stopped = false
  const soon = () => {
    window.clearTimeout(edit)
    // with another device open, send almost at once; alone there is no hurry (edits batch up)
    edit = window.setTimeout(() => void syncNow(userId), useSync.getState().peers > 0 ? 250 : 1200)
  }
  const unsub = useStore.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks || s.folders !== prev.folders || s.people !== prev.people) soon()
  })
  const tick = async (full: boolean) => {
    await (full ? syncNow(userId) : poll(userId))
    if (stopped) return
    const fast = isVisible() && useSync.getState().peers > 0
    window.clearTimeout(loop)
    loop = window.setTimeout(() => void tick(false), fast ? FAST_MS : isVisible() ? CALM_MS : HIDDEN_MS)
  }
  const wake = () => {
    if (!isVisible()) return
    window.clearTimeout(loop)
    void tick(true)
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
  void tick(true)
  return () => {
    stopped = true
    unsub()
    window.clearTimeout(edit)
    window.clearTimeout(loop)
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
  useSync.setState({ status: 'off', lastAt: null, error: null, peers: 0 })
}
