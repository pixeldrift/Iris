import { groupLook } from '../../core/looks'
import type { Folder, Scope, Task } from '../../core/types'

/** A bubble's colour: its main group's hue (the group given first, or the one being viewed), or one for its type when it has no group. */
export const bubbleHue = (task: Pick<Task, 'folderIds' | 'kind'> & Partial<Pick<Task, 'tagOrder' | 'personIds'>>, folders: Folder[], scope?: Scope): number => {
  const f = groupLook({ folderIds: task.folderIds, tagOrder: task.tagOrder, personIds: task.personIds ?? [] }, folders, scope).main
  return f ? f.hue : task.kind === 'idea' ? 320 : task.kind === 'list' ? 200 : task.kind === 'event' ? 40 : task.kind === 'habit' ? 150 : 285
}
