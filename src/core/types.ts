// Pure domain model. No React, no DOM: this file and the rest of src/core are
// the part that gets ported 1:1 to Swift (structs + pure functions).

export type TaskKind = 'task' | 'idea' | 'list' | 'event' | 'habit'

/** How a list's entries are marked: check boxes, bullets, or automatic numbers. */
export type ListStyle = 'check' | 'bullet' | 'number'

export interface ListItem {
  id: string
  text: string
  done: boolean
}
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  notes: string
  kind: TaskKind
  /** The entries of a `list` (a grocery list, say), and how they are marked. */
  items: ListItem[]
  listStyle: ListStyle
  /** Events: start and end time (`HH:MM`, 24h) on the day it is planned for, and where it is. */
  time: string | null
  endTime: string | null
  place: string
  /** Habits: the dates it was done. A habit repeats on `days` (every day when null) and is never "done". */
  log: string[]
  status: TaskStatus
  /** 0..1 soft weights. Never shown to the user as numbers. */
  importance: number
  urgency: number
  /** Position on the pond canvas, as a fraction of its size (0..1). */
  x: number
  y: number
  /** Local calendar dates, `YYYY-MM-DD`. */
  start: string | null
  /** The deadline. */
  due: string | null
  /** The day you plan to do it. Optional and separate from `due`; falls back to `due`. */
  day: string | null
  /** Carry over to the next day when not finished. Defaults to on. */
  rollover: boolean
  /** Weekdays (0 = Sunday) it can be done on, e.g. a class that meets Mon/Wed/Fri. null = any day. */
  days: number[] | null
  /** Folder ids. A task can live in many folders (tags). */
  folderIds: string[]
  /** People tagged on this task. */
  personIds: string[]
  /** The user said "no thanks" to adding contact details for this task. */
  contactDeclined?: boolean
  createdAt: number
  completedAt: number | null
}

/** The flower drawn for a folder (artwork: src/assets/flowers/<shape>.svg). */
export type FlowerShape =
  | 'blossom'
  | 'daisy'
  | 'rose'
  | 'lily'
  | 'iris'
  | 'tulip'
  | 'poppy'
  | 'cosmos'
  | 'pinwheel'
  | 'sunflower'
  | 'hibiscus'
  | 'bell'

export interface Folder {
  id: string
  name: string
  parentId: string | null
  /** Hue 0..360 used for the folder's dot and chips. */
  hue: number
  shape: FlowerShape
  /** Manual order among siblings. */
  sort: number
  createdAt: number
}

export interface Person {
  id: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
  hue: number
  /** Hearted people are the ones kept as shortcuts in the sidebar. */
  favorite: boolean
  createdAt: number
}

/** Virtual folders computed from the calendar; they are not stored. */
export type Scope =
  | { type: 'all' }
  | { type: 'inbox' }
  | { type: 'folder'; id: string }
  | { type: 'person'; id: string }
  /** The address book: everyone, hearted or not. Not a filter, a page of its own. */
  | { type: 'contacts' }
  | { type: 'day'; date: string }

export type ViewId = 'pond' | 'list' | 'board' | 'priority' | 'calendar' | 'timeline'

export type SortKey = 'flow' | 'due' | 'created' | 'title' | 'importance' | 'urgency'

/** How the pond clusters its bubbles. `free` keeps your own placement. */
export type PondGroup = 'free' | 'folder' | 'due' | 'kind' | 'person'
