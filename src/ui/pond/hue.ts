import type { Folder, Task } from '../../core/types'

/** A bubble's colour: its first group's hue, or one for its type when it has no group. */
export const bubbleHue = (task: Pick<Task, 'folderIds' | 'kind'>, folders: Folder[]): number => {
  const f = folders.find((x) => x.id === task.folderIds[0])
  return f ? f.hue : task.kind === 'idea' ? 320 : task.kind === 'list' ? 200 : task.kind === 'event' ? 40 : task.kind === 'habit' ? 150 : 285
}
