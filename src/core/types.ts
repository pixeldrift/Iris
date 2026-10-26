// Pure domain model. No React, no DOM: this file and the rest of src/core are
// the part that gets ported 1:1 to Swift (structs + pure functions).

export type TaskKind = 'task' | 'idea' | 'reminder'
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  notes: string
  kind: TaskKind
  status: TaskStatus
  /** 0..1 soft weights. Never shown to the user as numbers. */
  importance: number
  urgency: number
  /** Position on the pond canvas, as a fraction of its size (0..1). */
  x: number
  y: number
  /** Local calendar dates, `YYYY-MM-DD`. */
  start: string | null
  due: string | null
  /** Folder ids. A task can live in many folders (tags). */
  folderIds: string[]
  createdAt: number
  completedAt: number | null
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  /** Hue 0..360 used for the folder's dot and chips. */
  hue: number
  createdAt: number
}

/** Virtual folders computed from the calendar; they are not stored. */
export type Scope =
  | { type: 'all' }
  | { type: 'inbox' }
  | { type: 'folder'; id: string }
  | { type: 'day'; date: string }

export type ViewId = 'pond' | 'list' | 'board' | 'priority' | 'calendar' | 'timeline'

export type SortKey = 'flow' | 'due' | 'created' | 'title' | 'importance' | 'urgency'
