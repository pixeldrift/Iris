import type { Folder, ListItem, Task, TaskStatus } from './types'

/** One column of the Progress view. */
export interface Stage {
  id: string
  name: string
}

/** Every group starts with these three; a group can define its own (Research, First draft, Editing, Submitted…). */
export const DEFAULT_STAGES: Stage[] = [
  { id: 'todo', name: 'Pending' },
  { id: 'doing', name: 'In Progress' },
  { id: 'done', name: 'Completed' },
]

/** The stages that apply to a group: its own, if it has at least two, else the defaults. */
export const stagesOf = (folder?: Pick<Folder, 'stages'> | null): Stage[] => (folder?.stages && folder.stages.length >= 2 ? folder.stages : DEFAULT_STAGES)

/** The stages an item follows: those of its first group. */
export const stagesForTask = (t: Pick<Task, 'folderIds'>, folders: Folder[]): Stage[] => stagesOf(t.folderIds[0] ? folders.find((f) => f.id === t.folderIds[0]) : null)

/** Which stage (by position) an item is in. An item that never chose one sits by its status: first, second, or last. */
export function stageIndex(t: Pick<Task, 'stage' | 'status'>, stages: Stage[]): number {
  const i = t.stage ? stages.findIndex((s) => s.id === t.stage) : -1
  if (i >= 0) return i
  return t.status === 'done' ? stages.length - 1 : t.status === 'doing' ? Math.min(1, stages.length - 2) : 0
}

/** Pending at the start, Completed at the end, In Progress for everything between. */
export const statusAtStage = (i: number, n: number): TaskStatus => (i >= n - 1 ? 'done' : i <= 0 ? 'todo' : 'doing')

/** The fields that change when an item moves to stage `i`. */
export function patchForStage(stages: Stage[], i: number): Pick<Task, 'stage' | 'status'> {
  const idx = Math.max(0, Math.min(stages.length - 1, i))
  return { stage: stages[idx].id, status: statusAtStage(idx, stages.length) }
}

/**
 * Ticking things off moves a list along: the first tick starts it (In Progress), the last tick finishes it
 * (Completed), and unticking everything puts a finished list back at the start. Returns the new stage index, or
 * null when nothing should change.
 */
export function stageAfterTicks(t: Pick<Task, 'stage' | 'status'>, stages: Stage[], items: ListItem[]): number | null {
  if (items.length === 0) return null
  const done = items.filter((i) => i.done).length
  const cur = stageIndex(t, stages)
  const last = stages.length - 1
  if (done === items.length) return cur === last ? null : last
  if (done > 0) return cur === 0 || cur === last ? Math.min(1, last - 1) : null
  return cur === last ? 0 : null
}
