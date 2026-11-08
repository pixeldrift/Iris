import type { Folder, ListItem, Task, TaskStatus } from './types'

/** One column of the Progress view. */
export interface Stage {
  id: string
  name: string
}

/** Every group starts with these three; a group can define its own (Research, First draft, Editing, Submitted…). */
export const DEFAULT_STAGES: Stage[] = [
  { id: 'todo', name: 'Not started' },
  { id: 'doing', name: 'In progress' },
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

/** Not started at the start, Completed at the end, In progress for everything between. */
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

const RANK_GAP = 1024

/** One column's order: items placed by hand first (by rank), then the rest in the order given (by weight). */
export function orderInStage<T extends { rank?: number | null }>(tasks: T[]): T[] {
  const placed = tasks.filter((t) => t.rank != null).sort((a, b) => a.rank! - b.rank!)
  return [...placed, ...tasks.filter((t) => t.rank == null)]
}

/** A rank that puts an item above everything in a column (the default place for an item moved there or added there). */
export function topRank(column: { rank?: number | null }[]): number {
  const ranks = column.filter((t) => t.rank != null).map((t) => t.rank!)
  return ranks.length ? Math.min(...ranks) - RANK_GAP : 0
}

/**
 * The rank that makes an item land at position `at` of a column (`list` is the column in order, without the item itself).
 * Items not yet placed by hand that sit above the new spot are given ranks too, so they keep their order.
 */
export function planRank(list: { id: string; rank?: number | null }[], at: number): { rank: number; patches: Record<string, number> } {
  const placed = list.filter((t) => t.rank != null).length // (placed items always come first)
  if (at <= 0) return { rank: topRank(list), patches: {} }
  const i = Math.min(at, list.length)
  if (i <= placed) {
    const prev = list[i - 1].rank!
    return { rank: i < placed ? (prev + list[i].rank!) / 2 : prev + RANK_GAP, patches: {} }
  }
  const patches: Record<string, number> = {}
  let last = placed ? list[placed - 1].rank! : -RANK_GAP
  for (let k = placed; k < i; k++) patches[list[k].id] = last += RANK_GAP
  return { rank: last + RANK_GAP, patches }
}

/**
 * The percent at which an item enters each column, by position. The first is always 0 and the last 100; the ones between are the
 * numbers given (kept strictly rising and inside their neighbours) or, left alone, evenly spaced. The percents belong to the places
 * in the row, not to the columns' names, so dragging a column to a new spot does not carry its percent along.
 */
export function percentsFor(n: number, given?: number[] | null): number[] {
  if (n <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push(0)
    else if (i === n - 1) out.push(100)
    else {
      const want = given && typeof given[i] === 'number' ? Math.round(given[i]) : Math.round((i * 100) / (n - 1))
      // strictly above the one before, and leaving room for those still to come
      out.push(Math.max(out[i - 1] + 1, Math.min(want, 100 - (n - 1 - i))))
    }
  }
  return out
}

/** The column (by position) an item at this percent belongs in. */
export function stageForPercent(p: number, percents: number[]): number {
  let at = 0
  percents.forEach((x, i) => {
    if (p >= x) at = i
  })
  return at
}

/** How far along an item is, 0 to 100: finished is 100, otherwise what was set (an item put "in progress" with no number reads 50). */
export const progressOf = (t: Pick<Task, 'status' | 'progress'>): number => (t.status === 'done' ? 100 : Math.max(0, Math.min(100, Math.round(t.progress ?? (t.status === 'doing' ? 50 : 0)))))

/** Done out of total as a percent (0 when there is no total). */
export const percentOfCount = (done: number, total: number): number => (total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0)

/** Kinds that have a check box, and so a progress. */
export const hasProgress = (kind: string): boolean => kind === 'task' || kind === 'list'
