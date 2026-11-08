import type { DeleteChoices } from '../core/folders'
import { type ContactVerb } from '../core/people'
import { type Stage } from '../core/progress'
import type { PlayGate } from '../core/playlimit'
import type { Folder, Person, PondGroup, Scope, SortKey, Task, TaskStatus, ViewId } from '../core/types'

export interface Settings {
  /** Master switch: tapping the sound icon flips this. */
  sound: boolean
  sfxDrops: boolean
  sfxChimes: boolean
  sfxPops: boolean
  ambient: boolean
  volume: number
  drift: boolean
  sizeByPriority: boolean
  showDone: boolean
  sortKey: SortKey
  sortDesc: boolean
  pondGroup: PondGroup
  /** Sidebar spacing, 0 (compact) to 1 (relaxed). */
  sidebarSpace: number
  /** Timeline: show the task names in a column on the left instead of on the bars. */
  timelineLegend: boolean
  /** The interface's base color, as a hue (271 is the original violet). */
  themeHue: number
  /** Priority grid: how big the bubbles are drawn (1 = normal). The grid itself never changes. */
  priorityScale: number
  /** Labels that appear when you hover (or tap) an icon. */
  tooltips: boolean
  /** Quick add: apply what it understands (dates, people, groups) as you type, only suggest it (you tap to use it), or not try at all. */
  quickAdd: 'auto' | 'suggest' | 'off'
  /** Views left out of the sidebar (ones you do not use). At least one always stays. */
  hiddenViews: ViewId[]
  /** The order of the views in the sidebar (set by dragging in Settings, not in the menu itself). */
  viewOrder: ViewId[]
  /** Switching to another view also clears the filter (back to Everything), instead of keeping it. */
  viewsClearFilters: boolean
  /** Pop mode's running totals (kept on this device). */
  popStats: PopStats
  /** Keep playing (fun mode and the pop game) to three minutes at a time, with breaks between. Deleting is never limited. */
  limitPlay: boolean
  /** Urgency rises by itself as a deadline nears (the slider keeps your own value). */
  autoUrgency: boolean
  /** Reminders may also appear as system notifications (once the browser allows them); off keeps them inside Lilac. */
  systemNotifications: boolean
  /** Tell the others in a shared group when I add a task to it (off unless chosen). */
  notifyShared: boolean
  /** A due date brings a reminder with it. */
  autoRemind: boolean
  /** Where the play limit stands (kept on this device, so closing the page does not reset it). */
  playGate: PlayGate
  /** How dates are written (see core/locale). */
  dateFormat: 'us' | 'us-numeric' | 'dmy' | 'iso'
  clockFormat: '12' | '24'
}

export interface ContactPrompt {
  taskId: string
  name: string
  verb: ContactVerb
}

// (the Views list is pinned at the top and is not one of the movable sections)
/** Bubbles popped for fun, points won in the pop game, the best game, games played and time spent popping. */
export interface PopStats {
  popped: number
  points: number
  best: number
  games: number
  ms: number
}

export const SECTION_IDS = ['folders', 'people', 'week'] as const

export interface UiSlice {
  scope: Scope
  view: ViewId
  settings: Settings
  selectedId: string | null
  sidebarOpen: boolean
  /** On a phone turned sideways the menu is folded away (it shares the screen with the content rather than sliding over it). */
  navHidden: boolean
  setNavHidden: (hidden: boolean) => void
  /** Not persisted: ids mid exit-animation. */
  removing: Record<string, true>
  lingering: Record<string, true>
  /** Sidebar sections: their order and which are folded shut. */
  sidebar: { order: string[]; collapsed: string[] }
  contactPrompt: ContactPrompt | null
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null
  setScope: (s: Scope) => void
  /** Add a filter to the ones on, or take it off (shift/⌘-click, or a long press, in the sidebar). */
  toggleFilter: (part: Scope) => void
  addPopStats: (d: Partial<Omit<PopStats, 'best'>> & { best?: number }) => void
  setPlayGate: (g: PlayGate) => void
  setView: (v: ViewId) => void
  select: (id: string | null) => void
  setSidebar: (open: boolean) => void
  /** What is typed in the search box (not saved). Views filter or highlight by it. */
  search: string
  setSearch: (q: string) => void
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  toggleSection: (id: string) => void
  /** Put a sidebar section before `beforeId` (null = last). */
  moveSection: (id: string, beforeId: string | null) => void
  showToast: (text: string, action?: { label: string; run: () => void }) => void
}

export interface TasksSlice {
  tasks: Task[]
  addTask: (p: Partial<Task> & { title: string }) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  toggleDone: (id: string) => void
  setStatus: (id: string, s: TaskStatus) => void
  /** Move to a stage of the item's group (by stage id). */
  setStage: (id: string, stageId: string, stages?: Stage[]) => void
  /** `stages` = the columns the index refers to (default: the item's own group's). */
  moveToStage: (id: string, index: number, stages?: Stage[], keepProgress?: boolean) => void
  /** How far along it is (0 to 100): a count follows it, and it moves to the column that percent reaches. */
  setProgress: (id: string, percent: number) => void
  /** A count kept by hand (done out of total) in place of a list; null clears it. It sets the progress. */
  setTally: (id: string, tally: { done: number; total: number } | null) => void
  addToFolder: (taskId: string, folderId: string) => void
  removeFromFolder: (taskId: string, folderId: string) => void
  addPerson: (taskId: string, personId: string) => void
  removePerson: (taskId: string, personId: string) => void
  setDue: (taskId: string, due: string | null, dueTime?: string | null) => void
  /** Plan the task for a day (separate from its deadline). */
  setDay: (taskId: string, day: string | null) => void
  /** Move unfinished tasks planned for past days to their next available day. */
  rollover: () => void
  /** Dragging a bubble into another pond cluster re-tags it to match. */
  assignToGroup: (taskId: string, mode: PondGroup, key: string) => void
  /** Throw away a task that was only being set up in the quick-add box. */
  discardDraft: (id: string) => void
  /** Set (or clear with null) the alert on a task. */
  /** `which`: the reminder for the day to do it (default) or for the deadline. */
  setReminder: (id: string, at: number | null, before?: number | null, which?: 'do' | 'due') => void
  /** Look at a task's title for "call/email Sarah" and link or ask. */
  checkContact: (taskId: string) => void
  resolveContact: (personId: string | null) => void
  /** Single entry point for every drag & drop in the app. */
  /** `hint` is where in a Progress column it was dropped: the column's items in order (without it) and the position. No hint puts it at the top. */
  dropTask: (taskId: string, target: string, hint?: { index: number; ids: string[] }) => boolean
  /** Set the by-hand rank of several items at once. */
  applyRanks: (ranks: Record<string, number>) => void
}

export interface FoldersSlice {
  folders: Folder[]
  updateFolder: (id: string, patch: Partial<Folder>) => void
  addFolder: (name: string, parentId?: string | null) => string
  ensureFolderPath: (path: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string, choices?: DeleteChoices) => void
  /** Re-parent and/or reorder: `beforeId` = sibling to sit in front of (null = last). */
  moveFolder: (id: string, parentId: string | null, beforeId?: string | null) => void
}

export interface PeopleSlice {
  people: Person[]
  savePerson: (p: Partial<Person> & { name: string }) => string
  deletePerson: (id: string) => void
  togglePersonFavorite: (id: string) => void
  /** Make sure the signed-in person has their own contact entry (the same id on every device). */
  ensureMe: (user: { id: string; name: string; email: string }) => void
}

export interface DataSlice {
  /** Add the demo content (anything not already there), or take it away again. */
  importDemo: () => void
  removeDemo: () => void
  /** Start fresh: every task, group and person goes (your own profile stays). */
  clearEverything: () => void
}

export type State = UiSlice & TasksSlice & FoldersSlice & PeopleSlice & DataSlice

export type SetState = (partial: Partial<State> | ((s: State) => Partial<State> | State)) => void
export type GetState = () => State
