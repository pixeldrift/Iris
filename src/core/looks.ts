import { descendantIds } from './folders'
import { tagsOf } from './tasks'
import type { Folder, Scope, Task } from './types'

/** How many of an item's other groups are drawn as little dots (the first two of them also tint the item softly). */
export const MAX_DOTS = 4

export interface GroupLook {
  /** The group whose colour (and flower) the item wears: the one it was given first, or the one being viewed. */
  main: Folder | null
  /** Its other groups, in the order of its tags (which is what dragging tags into a different order sets). */
  extras: Folder[]
}

/** The groups a view is looking at (a group's own page, or several filters at once). */
export function scopeFolderIds(scope: Scope | undefined): string[] {
  if (!scope) return []
  if (scope.type === 'folder') return [scope.id]
  if (scope.type === 'multi') return scope.parts.flatMap((p) => (p.type === 'folder' ? [p.id] : []))
  return []
}

/**
 * What colours an item wears. By default its main colour is the group it was given first (`folderIds[0]`, which reordering tags never touches),
 * and its other groups follow in tag order. While a group is being viewed, that group's colour and flower come first for the items in it.
 */
export function groupLook(task: Pick<Task, 'folderIds' | 'tagOrder' | 'personIds'>, folders: Folder[], scope?: Scope): GroupLook {
  const mine = task.folderIds.map((id) => folders.find((f) => f.id === id)).filter((f): f is Folder => !!f)
  if (!mine.length) return { main: null, extras: [] }
  let main = mine[0]
  const viewed = scopeFolderIds(scope)
  if (viewed.length) {
    // the viewed group itself first; failing that, one of its subgroups (an item in English 101 while School is being viewed)
    const exact = mine.find((f) => viewed.includes(f.id))
    const inside = mine.find((f) => viewed.some((v) => descendantIds(folders, v).has(f.id)))
    main = exact ?? inside ?? main
  }
  const order = tagsOf(task as Task)
    .filter((t) => t.kind === 'folder')
    .map((t) => mine.find((f) => f.id === t.id))
    .filter((f): f is Folder => !!f && f.id !== main.id)
  return { main, extras: order.slice(0, MAX_DOTS) }
}
