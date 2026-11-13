import { create } from 'zustand'
import { assigneesOf } from '../core/tasks'
import { descendantIds } from '../core/folders'
import type { Folder, Task } from '../core/types'
import { suppressHistory } from '../state/history'
import { useStore } from '../state/store'
import { apiToken } from './auth'
import { notify } from '../audio/engine'

/** Sharing a group (see api/_lib/share.ts for the rules, and docs/COLLABORATION.md). */
export interface ShareMember {
  userId: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  status: 'active' | 'leaving'
  /** has the app open right now */
  active: boolean
}
export interface ShareInfo {
  workspaceId: string
  name: string
  rootFolderId: string | null
  rootTaskId: string | null
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

/** One line saying what happened, for the notifications list and for the pop-up that appears when it arrives. */
export function describeNews(n: { kind: string; from: string; info: string; extra?: string }): string {
  switch (n.kind) {
    case 'share-invite': return `${n.from} invited you to share “${n.info}”`
    case 'share-removed': return `${n.from} removed you from “${n.info}”${n.extra === 'copy' ? '. You can keep a copy.' : '.'}`
    case 'share-joined': return `${n.from} joined “${n.info}”`
    case 'share-left': return `${n.from} left “${n.info}”`
    case 'share-deleted': return `${n.from} deleted “${n.info}”, so it is no longer shared`
    case 'share-folder-deleted': return `${n.from} deleted the group “${n.info}”`
    case 'assigned': return `${n.from} gave you “${n.info}”`
    case 'task-added': return `${n.from} added “${n.info}”`
    default: return n.info
  }
}

let seenNews: Set<string> | null = null

export async function refreshShare() {
  const s = await call<Omit<ShareState, 'loaded'>>({ action: 'state' })
  // a soft sound for something new for you (a task given to you, an invitation, a task added), but not for what was already waiting
  const fresh = [...s.invites.map((i) => i.id), ...s.news.filter((n) => !n.read).map((n) => n.id)]
  if (seenNews && fresh.some((id) => !seenNews!.has(id)) && document.visibilityState === 'visible') {
    notify()
    // and a pop-up saying what it is (an invitation, being added or removed, a group deleted, a task for you)
    const lines = [
      ...s.invites.filter((i) => !seenNews!.has(i.id)).map((i) => describeNews({ kind: 'share-invite', from: i.from, info: i.name })),
      ...s.news.filter((n) => !n.read && !seenNews!.has(n.id)).map((n) => describeNews(n)),
    ]
    if (lines.length) useStore.getState().showToast(lines.length === 1 ? lines[0] : `${lines[0]} (and ${lines.length - 1} more in your notifications)`)
  }
  seenNews = new Set(fresh)
  useShare.setState({ ...s, loaded: true })
  alignTaskWorkspaces()
  settleUnsharing(s.shares)
}

/** Who is here right now, asked often and cheaply (the rest of the sharing state changes far less). */
async function refreshPresence() {
  const { active } = await call<{ active: string[] }>({ action: 'presence' })
  const live = new Set(active)
  useShare.setState((s) => {
    let changed = false
    const shares = s.shares.map((sh) => ({ ...sh, members: sh.members.map((m) => { const a = live.has(m.userId); if (a !== m.active) changed = true; return a === m.active ? m : { ...m, active: a } }) }))
    return changed ? { shares } : s
  })
}

/** Keep the sharing state fresh while the app is open (people accept, leave, or assign things at any moment). */
export function startShare(): () => void {
  const tick = () => {
    if (document.visibilityState === 'visible') void refreshShare().catch(() => undefined)
  }
  tick()
  const timer = window.setInterval(tick, 20_000)
  // who is here is asked for much more often (every few seconds, and only when the app is showing and there is someone to ask about)
  const live = window.setInterval(() => {
    if (document.visibilityState === 'visible' && useShare.getState().shares.some((x) => x.members.length > 1)) void refreshPresence().catch(() => undefined)
  }, 4000)
  const wake = () => document.visibilityState === 'visible' && tick()
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  return () => {
    window.clearInterval(timer)
    window.clearInterval(live)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('focus', wake)
    useShare.setState(EMPTY)
    seenNews = null
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
    tasks: s.tasks.map((t) => (taskIds.has(t.id) ? (workspaceId ? stamp(t) : { ...stamp(t), assigneeId: undefined, assigneeIds: undefined }) : t)),
  }))
}

/**
 * A group inside a shared group is shared with it, by default: a new subgroup (or one dragged in) joins its parent's workspace, and one
 * dragged out of every shared group comes back to its owner's own space. The group that was actually shared (the root of a share) keeps its own.
 */
function alignFolderWorkspaces() {
  const sh = useShare.getState()
  if (!sh.loaded) return // (what is shared is not known yet: do not undo anything on a guess)
  const s = useStore.getState()
  const roots = new Set(sh.shares.map((x) => x.rootFolderId).filter(Boolean))
  const byId = new Map(s.folders.map((f) => [f.id, f]))
  const memo = new Map<string, string | undefined>()
  const expected = (f: Folder, depth = 0): string | undefined => {
    if (memo.has(f.id)) return memo.get(f.id)
    let ws: string | undefined
    if (roots.has(f.id)) ws = f.workspaceId // a share's own root keeps its workspace
    else {
      const parent = f.parentId && depth < 50 ? byId.get(f.parentId) : undefined
      ws = parent ? expected(parent, depth + 1) : undefined
    }
    memo.set(f.id, ws)
    return ws
  }
  let changed = false
  const folders = s.folders.map((f) => {
    const ws = expected(f)
    if (ws === f.workspaceId) return f
    changed = true
    if (ws) return { ...f, workspaceId: ws }
    const { workspaceId: _w, ...rest } = f
    return rest as Folder
  })
  if (changed) suppressHistory(() => useStore.setState({ folders }))
}

/**
 * A task that is in a shared group lives in that group's workspace, wherever it was made or tagged (so a task added to a shared
 * group after it was shared reaches everyone), and one taken out of every shared group comes back to its owner's own space.
 */
export function alignTaskWorkspaces() {
  alignFolderWorkspaces()
  if (!useShare.getState().loaded) return // do not strip individual or group workspace ids before sharing state arrives
  const s = useStore.getState()
  const shared = new Map(s.folders.filter((f) => f.workspaceId).map((f) => [f.id, f.workspaceId as string]))
  if (!shared.size && !s.tasks.some((t) => t.workspaceId)) return
  let changed = false
  const taskShares = new Map(useShare.getState().shares.filter((x) => x.rootTaskId).map((x) => [x.rootTaskId!, x.workspaceId]))
  const tasks = s.tasks.map((t) => {
    const ws = taskShares.get(t.id) ?? t.folderIds.map((id) => shared.get(id)).find(Boolean)
    if (ws === t.workspaceId) return t
    changed = true
    if (ws) return { ...t, workspaceId: ws }
    const { workspaceId: _w, assigneeId: _a, assigneeIds: _as, ...rest } = t
    return rest as Task
  })
  if (changed) suppressHistory(() => useStore.setState({ tasks }))
}

/** How many tasks are in a group (and the ones under it): what a person is told will be shared. */
export const countShared = (rootId: string) => subtreeOf(rootId).taskIds.size

/** Give an individual task or event its own shared space, without sharing its containing group. */
export async function shareTask(task: Task, toUserId: string, role: 'editor' | 'viewer' = 'editor') {
  if (task.workspaceId) {
    const existing = useShare.getState().shares.find((x) => x.workspaceId === task.workspaceId)
    if (existing?.rootTaskId !== task.id) throw new Error('This item is already shared through a group. Manage access from that group instead.')
    if (existing.role !== 'owner') throw new Error('Only the owner can invite someone to this shared item.')
    await inviteConnection(existing.workspaceId, toUserId, role)
    return
  }
  const { workspaceId } = await call<{ workspaceId: string }>({ action: 'create', name: task.title || 'Shared item', rootTaskId: task.id })
  useStore.getState().updateTask(task.id, { workspaceId })
  try {
    await refreshShare()
    await inviteConnection(workspaceId, toUserId, role)
  } catch (error) {
    useStore.getState().updateTask(task.id, { workspaceId: undefined })
    await call({ action: 'retire', workspaceId }).catch(() => undefined)
    await refreshShare().catch(() => undefined)
    throw error
  }
}

export async function shareGroup(folder: Folder) {
  // a group that was shared before and then taken back leaves an empty shell behind: close it, so this starts a fresh share
  const stale = useShare.getState().shares.find((x) => x.rootFolderId === folder.id && x.role === 'owner' && folder.workspaceId !== x.workspaceId)
  if (stale) await call({ action: 'retire', workspaceId: stale.workspaceId }).catch(() => undefined)
  const { workspaceId } = await call<{ workspaceId: string }>({ action: 'create', name: folder.name, rootFolderId: folder.id })
  await refreshShare() // (so the group is known as a share's root before anything is moved into it)
  moveTo(folder.id, workspaceId)
}

export const inviteConnection = (workspaceId: string, toUserId: string, role: 'editor' | 'viewer') =>
  call({ action: 'invite', workspaceId, toUserId, role }).then(() => {
    notify() // (the same sound they hear when it arrives)
    return refreshShare()
  })

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
  if (share.rootFolderId && !allowCopy) {
    moveTo(share.rootFolderId, undefined)
    await call({ action: 'retire', workspaceId: share.workspaceId }).catch(() => undefined)
  } else if (share.rootTaskId && !allowCopy) {
    const task = useStore.getState().tasks.find((t) => t.id === share.rootTaskId)
    if (task) useStore.getState().updateTask(task.id, { workspaceId: undefined, assigneeId: undefined, assigneeIds: undefined })
    await call({ action: 'retire', workspaceId: share.workspaceId }).catch(() => undefined)
  } else rememberUnsharing(share.workspaceId)
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
    else if (s.rootFolderId) {
      moveTo(s.rootFolderId, undefined)
      void call({ action: 'retire', workspaceId: ws }).then(refreshShare, () => undefined)
    } else if (s.rootTaskId) {
      const task = useStore.getState().tasks.find((t) => t.id === s.rootTaskId)
      if (task) useStore.getState().updateTask(task.id, { workspaceId: undefined, assigneeId: undefined, assigneeIds: undefined })
      void call({ action: 'retire', workspaceId: ws }).then(refreshShare, () => undefined)
    }
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
    const { workspaceId: _w, assigneeId: _a, assigneeIds: _as, ...rest } = t
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
/** Clear one bit of sharing news, or all of it (invitations that wait for an answer stay). */
export const clearShareNews = (id?: string) => call({ action: 'clear', ...(id ? { id } : {}) }).then(refreshShare)
export const markShareRead = () => call({ action: 'read' }).then(refreshShare)

/** Give a task to members of its group (and tell the ones who are newly given it). */
export function assignTask(task: Task, userIds: string[], title = task.title) {
  const before = new Set(assigneesOf(task))
  useStore.getState().updateTask(task.id, { assigneeIds: userIds, assigneeId: userIds[0] })
  if (!task.workspaceId) return
  for (const userId of userIds) if (!before.has(userId)) void call({ action: 'assigned', workspaceId: task.workspaceId, userId, taskId: task.id, title }).catch(() => undefined)
}

/** Tell the others in a shared group that a task was added (only when this person has switched that on). */
export function announceAdded(workspaceId: string, taskId: string, title: string) {
  void call({ action: 'added', workspaceId, taskId, title }).catch(() => undefined)
}

/** A member's picture: your own, or a connected person's whose entry in your address book is linked to their account. */
export function memberPhoto(userId: string, me: string): string | undefined {
  const people = useStore.getState().people
  if (userId === me) return people.find((p) => p.isMe)?.photo
  return people.find((p) => p.link?.userId === userId)?.photo
}

/** Is this person (a connection whose entry is linked to their account) in a group you share, and have they the app open right now? null when it is not known. */
export function presenceOf(userId: string | undefined): boolean | null {
  if (!userId) return null
  let known: boolean | null = null
  for (const sh of useShare.getState().shares) for (const m of sh.members) if (m.userId === userId) known = (known ?? false) || m.active
  return known
}

/** Delete a group. When it is shared, the others are told first (and if it is the group a share began with, sharing ends with it). */
export async function deleteGroup(folder: Folder, choices: Parameters<ReturnType<typeof useStore.getState>['deleteFolder']>[1]) {
  const share = folder.workspaceId ? useShare.getState().shares.find((x) => x.workspaceId === folder.workspaceId) : undefined
  if (share) {
    const root = share.rootFolderId === folder.id
    if (root && share.role !== 'owner') {
      useStore.getState().showToast('Only the owner can delete a shared group. Leave it instead (the group’s Sharing menu).')
      return
    }
    await call({ action: 'deleted', workspaceId: share.workspaceId, name: folder.name, root }).catch(() => undefined)
  }
  useStore.getState().deleteFolder(folder.id, choices)
}
