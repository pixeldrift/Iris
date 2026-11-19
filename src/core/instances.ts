import { descendantIds } from './folders'
import { scopeFolderIds } from './looks'
import type { Folder, Scope, Task } from './types'

/**
 * An item in several groups shows in each of them. Each place it shows is an "instance": the one in the group it was given first is
 * keyed by the item's own id (so what was already stored for it stays), and each of the others by `id@group`.
 */
export const NO_GROUP = 'none'
export const realId = (key: string) => key.split('@')[0]
export const groupOfKey = (key: string): string | undefined => (key.includes('@') ? key.slice(key.indexOf('@') + 1) : undefined)

export interface Instance {
  key: string
  folderId: string
}

/**
 * Where an item shows: one instance for each of its groups that exists. While a group is being viewed only the places inside it count (an item
 * in English 101 and in Home, viewed from School, is shown in English 101 alone).
 */
export function instancesOf(task: Pick<Task, 'id' | 'folderIds'>, folders: Folder[], scope?: Scope): Instance[] {
  const have = new Set(folders.map((f) => f.id))
  const mine = task.folderIds.filter((id) => have.has(id))
  if (!mine.length) return [{ key: task.id, folderId: NO_GROUP }]
  const viewed = scopeFolderIds(scope)
  let allowed: Set<string> | null = null
  if (viewed.length) {
    allowed = new Set(viewed)
    for (const v of viewed) for (const d of descendantIds(folders, v)) allowed.add(d)
  }
  const first = mine[0]
  const out = mine.map((folderId) => ({ key: folderId === first ? task.id : `${task.id}@${folderId}`, folderId })).filter((i) => !allowed || allowed.has(i.folderId))
  return out.length ? out : [{ key: task.id, folderId: first }]
}
