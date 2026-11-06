import { create } from 'zustand'
import { descendantIds } from '../core/folders'
import type { Folder, Task } from '../core/types'
import { suppressHistory } from '../state/history'
import { useStore } from '../state/store'
import { apiToken } from './auth'

/** Sharing a group (see api/_lib/share.ts for the rules, and docs/COLLABORATION.md). */
export interface ShareMember {
  userId: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  status: 'active' | 'leaving'
}
export interface ShareInfo {
  workspaceId: string
  name: string
  rootFolderId: string | null
  role: 'owner' | 'editor' | 'viewer'
  status: 'active' | 'leaving'
  canCopy: boolean
  members: ShareMember[]
  pending: number
}
export interface ShareInvite {
  id: string
  workspaceId: string
  name: string
  from: string
  role: string
}
export interface ShareNews {
  id: string
  kind: string
  workspaceId: string | null
  from: string
  info: string
  extra: string
  read: boolean
  at: string
}
interface ShareState {
  loaded: boolean
  me: string
  shares: ShareInfo[]
  invites: ShareInvite[]
  news: ShareNews[]
}
const EMPTY: ShareState = { loaded: false, me: '', shares: [], invites: [], news: [] }
export const useShare = create<ShareState>(() => EMPTY)

async function call<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const token = await apiToken()
  if (!token) throw new Error('You’re not signed in.')
  let res: Response
  try {
    res = await fetch('/api/share', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Couldn’t reach Lilac. Check your connection.')
  }
  const out = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(out.error ?? 'Something went wrong. Try again.')
  return out
}

export async function refreshShare() {
  const s = await call<Omit<ShareState, 'loaded'>>({ action: 'state' })
  useShare.setState({ ...s, loaded: true })
  settleUnsharing(s.shares)
}

/** Keep the sharing state fresh while the app is open (people accept, leave, or assign things at any moment). */
export function startShare(): () => void {
  const tick = () => {
    if (document.visibilityState === 'visible') void refreshShare().catch(() => undefined)
  }
  tick()
  const timer = window.setInterval(tick, 20_000)
  const wake = () => document.visibilityState === 'visible' && tick()
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('focus', wake)
    useShare.setState(EMPTY)
  }
}

// ---------- moving a group in and out of sharing ----------

/** The group, the groups under it, and every task tagged with any of them. */
function subtreeOf(rootId: string) {
  const s = useStore.getState()
  const ids = descendantIds(s.folders, rootId)
  return { folderIds: ids, taskIds: new Set(s.tasks.filter((t) => t.folderIds.some((f) => ids.has(f))).map((t) => t.id)) }
}

function moveTo(rootId: string, workspaceId: string | undefined) {
  const { folderIds, taskIds } = subtreeOf(rootId)
  const stamp = <T extends { workspaceId?: string }>(x: T): T => {
    const { workspaceId: _drop, ...rest } = x
    return (workspaceId ? { ...rest, workspaceId } : rest) as T
  }
  useStore.setState((s) => ({
    folders: s.folders.map((f) => (folderIds.has(f.id) ? stamp(f) : f)),
    tasks: s.tasks.map((t) => (taskIds.has(t.id) ? (workspaceId ? stamp(t) : { ...stamp(t), assigneeId: undefined }) : t)),
  }))
}

/**
 * A task that is in a shared group lives in that group's workspace, wherever it was made or tagged (so a task added to a shared
 * group after it was shared reaches everyone), and one taken out of every shared group comes back to its owner's own space.
 */
export function alignTaskWorkspaces() {
  const s = useStore.getState()
  const shared = new Map(s.folders.filter((f) => f.workspaceId).map((f) => [f.id, f.workspaceId as string]))
  if (!shared.size && !s.tasks.some((t) => t.workspaceId)) return
  let changed = false
  const tasks = s.tasks.map((t) => {
    const ws = t.folderIds.map((id) => shared.get(id)).find(Boolean)
    if (ws === t.workspaceId) return t
    changed = true
    if (ws) return { ...t, workspaceId: ws }
    const { workspaceId: _w, assigneeId: _a, ...rest } = t
    return rest as Task
  })
  if (changed) suppressHistory(() => useStore.setState({ tasks }))
}

/** How many tasks are in a group (and the ones under it): what a person is told will be shared. */
export const countShared = (rootId: string) => subtreeOf(rootId).taskIds.size

export async function shareGroup(folder: Folder) {
  const { workspaceId } = await call<{ workspaceId: string }>({ action: 'create', name: folder.name, rootFolderId: folder.id })
  moveTo(folder.id, workspaceId)
  await refreshShare()
}

export const inviteConnection = (workspaceId: string, toUserId: string, role: 'editor' | 'viewer') => call({ action: 'invite', workspaceId, toUserId, role }).then(refreshShare)

export async function inviteLink(workspaceId: string, role: 'editor' | 'viewer'): Promise<string> {
  const { token } = await call<{ token: string }>({ action: 'link', workspaceId, role })
  return `${location.origin}/?join=${encodeURIComponent(token)}`
}

export const setMemberRole = (workspaceId: string, userId: string, role: 'editor' | 'viewer') => call({ action: 'role', workspaceId, userId, role }).then(refreshShare)

export const removeMember = (workspaceId: string, userId: string, allowCopy: boolean) => call({ action: 'remove', workspaceId, userId, allowCopy }).then(refreshShare)

/**
 * Stop sharing. With no copy allowed everyone is cut off now and the group comes home straight away. With a copy allowed, people keep
 * read-only access until they decide, so the group stays where it is until they all have (it comes home on its own then).
 */
export async function stopSharing(share: ShareInfo, allowCopy: boolean) {
  await call({ action: 'stop', workspaceId: share.workspaceId, allowCopy })
  if (share.rootFolderId && !allowCopy) moveTo(share.rootFolderId, undefined)
  else rememberUnsharing(share.workspaceId)
  await refreshShare()
}

const UNSHARING = 'lilac-unsharing'
const unsharing = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(UNSHARING) ?? '[]') as string[]
  } catch {
    return []
  }
}
const rememberUnsharing = (ws: string) => {
  try {
    localStorage.setItem(UNSHARING, JSON.stringify([...new Set([...unsharing(), ws])]))
  } catch {
    /* ignore */
  }
}
/** A group the owner stopped sharing comes home once nobody is left in it. */
function settleUnsharing(shares: ShareInfo[]) {
  const pending = unsharing()
  if (!pending.length) return
  const keep: string[] = []
  for (const ws of pending) {
    const s = shares.find((x) => x.workspaceId === ws)
    if (!s) continue // already gone
    if (s.members.some((m) => m.role !== 'owner')) keep.push(ws)
    else if (s.rootFolderId) moveTo(s.rootFolderId, undefined)
  }
  try {
    localStorage.setItem(UNSHARING, JSON.stringify(keep))
  } catch {
    /* ignore */
  }
}

/** Copy a shared group into this person's own space (new ids, nothing shared): what "keep a copy" does. */
export function copyShared(workspaceId: string, rootFolderId: string | null) {
  const s = useStore.getState()
  const folders = s.folders.filter((f) => f.workspaceId === workspaceId)
  const tasks = s.tasks.filter((t) => t.workspaceId === workspaceId)
  const newId = (): string => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const fmap = new Map(folders.map((f) => [f.id, newId()]))
  const copiedFolders: Folder[] = folders.map((f) => {
    const { workspaceId: _w, ...rest } = f
    return { ...rest, id: fmap.get(f.id)!, parentId: f.id === rootFolderId || !f.parentId ? null : fmap.get(f.parentId) ?? null }
  })
  const copiedTasks: Task[] = tasks.map((t) => {
    const { workspaceId: _w, assigneeId: _a, ...rest } = t
    return { ...rest, id: newId(), folderIds: t.folderIds.map((id) => fmap.get(id)).filter((x): x is string => !!x) }
  })
  suppressHistory(() => useStore.setState((st) => ({ folders: [...st.folders, ...copiedFolders], tasks: [...st.tasks, ...copiedTasks] })))
  return copiedTasks.length
}

/** Leave a group, keeping a copy of it first if asked. */
export async function leaveGroup(share: ShareInfo, keepCopy: boolean) {
  if (keepCopy) copyShared(share.workspaceId, share.rootFolderId)
  await call({ action: 'leave', workspaceId: share.workspaceId })
  await refreshShare()
}

export const acceptInvite = (inviteId: string) => call<{ workspaceId: string; name: string }>({ action: 'accept', inviteId }).then(async (r) => (await refreshShare(), r))
export const acceptToken = (token: string) => call<{ workspaceId: string; name: string }>({ action: 'accept', token }).then(async (r) => (await refreshShare(), r))
export const declineInvite = (inviteId: string) => call({ action: 'decline', inviteId }).then(refreshShare)
export const markShareRead = () => call({ action: 'read' }).then(refreshShare)

/** Give a task to a member of its group (and tell them). */
export function assignTask(task: Task, userId: string | undefined, title = task.title) {
  useStore.getState().updateTask(task.id, { assigneeId: userId })
  if (userId && task.workspaceId) void call({ action: 'assigned', workspaceId: task.workspaceId, userId, taskId: task.id, title }).catch(() => undefined)
}
