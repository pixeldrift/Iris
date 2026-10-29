// Pure domain model. No React, no DOM: this file and the rest of src/core are
// the part that gets ported 1:1 to Swift (structs + pure functions).

/** How a task repeats. `from` is the first date of the series (a task's own `day` takes over when set). */
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Every n days / weeks / months / years. */
  interval: number
  /** Weekly: weekdays (0 = Sunday). Empty/absent = the weekday of `from`. */
  byDay?: number[]
  /** Monthly: day of the month (absent = the day of `from`; 31 in a short month means its last day). */
  monthDay?: number
  /** Monthly, with one weekday in `byDay`: the nth such weekday of the month (1-4, or -1 for the last): "the third Tuesday". */
  nth?: number
  /** Chosen with the Custom option (so the full controls stay open). */
  custom?: boolean
  from: string
}

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
  /** Being set up in the quick-add box: kept out of every view, count and sync until placed. */
  draft?: boolean
  /** The shared workspace it lives in; absent = the person's own. (Sharing has no UI yet.) */
  workspaceId?: string
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
  /** The dates a repeating task or habit was done. */
  log: string[]
  /** A repeating task or habit. Each occurrence is ticked off in `log`; the task itself is never "done". */
  repeat: Recurrence | null
  /** Events: any number of reminders, each as minutes before the start (0 = at the start). */
  alerts: number[]
  /** Which of those have already gone off (`<start ms>:<minutes>`), so each fires once per occurrence. */
  alertsDone: string[]
  /** An alert: when to nudge (epoch ms), and whether it has already gone off. */
  remindAt: number | null
  /** A reminder set relative to the item's day or deadline ("a day before"): how many days. It follows the date if it moves. */
  remindBefore?: number | null
  reminded: boolean
  status: TaskStatus
  /** Its column in the Progress view when its group defines custom stages (by stage id); else derived from `status`. */
  stage?: string | null
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
  /** As on Task. */
  workspaceId?: string
  name: string
  parentId: string | null
  /** Hue 0..360 used for the folder's dot and chips. */
  hue: number
  shape: FlowerShape
  /** Manual order among siblings. */
  sort: number
  /** Custom Progress stages for items in this group (two or more); absent = Pending / In Progress / Completed. */
  stages?: { id: string; name: string }[]
  createdAt: number
}

export interface Person {
  id: string
  /** The full name as shown (first + last). */
  name: string
  first?: string
  last?: string
  /** The signed-in person's own entry (created from their account). */
  isMe?: boolean
  /** Labels like Family or Friend, for grouping the address book. */
  categories?: string[]
  phone: string
  email: string
  /** The address as one line (always kept in step with the parts below). */
  address: string
  street?: string
  city?: string
  state?: string
  zip?: string
  notes: string
  hue: number
  /** Hearted people are the ones kept as shortcuts in the sidebar. */
  favorite: boolean
  /** Any number of further phone numbers, emails, addresses, links or notes (Home, Work, Mobile…). */
  extras?: PersonExtra[]
  /** `YYYY-MM-DD`. */
  birthday?: string | null
  createdAt: number
}

export interface PersonExtra {
  id: string
  kind: 'phone' | 'email' | 'address' | 'link' | 'other'
  label: string
  value: string
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
