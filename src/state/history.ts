import { create } from 'zustand'
import type { Folder, Person, Task } from '../core/types'
import { useStore } from './store'

/**
 * Undo and redo for everything that is data: tasks, groups and people. Each step is a before/after pair of
 * snapshots (the arrays are immutable, so a snapshot is just a few references). Changes that arrive in quick
 * succession on the same things (typing a name, dragging a slider) count as one step.
 */
interface Snap {
  tasks: Task[]
  folders: Folder[]
  people: Person[]
}
interface Entry {
  before: Snap
  after: Snap
  label: string
  at: number
  /** Ids touched, so only changes to the same things merge. */
  touched: string
}

const MAX_STEPS = 100
const MERGE_MS = 800

let past: Entry[] = []
let future: Entry[] = []
let suppressed = 0
let restoring = false

/** What the history says right now, for the buttons. */
export const useHistory = create<{ undoLabel: string | null; redoLabel: string | null }>(() => ({ undoLabel: null, redoLabel: null }))
const publish = () => useHistory.setState({ undoLabel: past.at(-1)?.label ?? null, redoLabel: future.at(-1)?.label ?? null })

/** Run a change that should NOT be undoable: another device's edits arriving, or the app's own bookkeeping. */
export function suppressHistory<T>(fn: () => T): T {
  suppressed++
  try {
    return fn()
  } finally {
    suppressed--
  }
}

export function clearHistory() {
  past = []
  future = []
  publish()
}

const snap = (s: { tasks: Task[]; folders: Folder[]; people: Person[] }): Snap => ({ tasks: s.tasks.filter((t) => !t.draft), folders: s.folders, people: s.people })
const same = <T,>(a: T[], b: T[]) => a === b || (a.length === b.length && a.every((x, i) => x === b[i]))

const q = (t: string) => `“${t.trim() || 'Untitled'}”`

/** A short phrase for what changed between two snapshots ("Deleted “Book dentist”"). */
export function describe(a: Snap, b: Snap): { label: string; touched: string[] } {
  const parts: { label: string; id: string }[] = []
  const diff = <T extends { id: string }>(x: T[], y: T[], onAdd: (n: T) => string, onDel: (o: T) => string, onChange: (o: T, n: T) => string) => {
    const xm = new Map(x.map((i) => [i.id, i]))
    const ym = new Map(y.map((i) => [i.id, i]))
    for (const n of y) {
      const o = xm.get(n.id)
      if (!o) parts.push({ label: onAdd(n), id: n.id })
      else if (o !== n) parts.push({ label: onChange(o, n), id: n.id })
    }
    for (const o of x) if (!ym.has(o.id)) parts.push({ label: onDel(o), id: o.id })
  }
  diff(
    a.tasks,
    b.tasks,
    (n) => `Added ${q(n.title)}`,
    (o) => `Deleted ${q(o.title)}`,
    (o, n) =>
      n.title !== o.title
        ? `Renamed ${q(o.title)}`
        : n.status !== o.status
          ? n.status === 'done'
            ? `Checked off ${q(n.title)}`
            : `Reopened ${q(n.title)}`
          : n.log.length !== o.log.length
            ? `Ticked ${q(n.title)}`
            : n.folderIds !== o.folderIds || n.personIds !== o.personIds
              ? `Retagged ${q(n.title)}`
              : n.x !== o.x || n.y !== o.y
                ? `Moved ${q(n.title)}`
                : `Edited ${q(n.title)}`,
  )
  diff(
    a.folders,
    b.folders,
    (n) => `Added group ${q(n.name)}`,
    (o) => `Deleted group ${q(o.name)}`,
    (o, n) => (n.name !== o.name ? `Renamed group ${q(o.name)}` : n.hue !== o.hue ? `Changed color of ${q(n.name)}` : n.shape !== o.shape ? `Changed flower of ${q(n.name)}` : n.parentId !== o.parentId || n.sort !== o.sort ? `Moved group ${q(n.name)}` : `Edited group ${q(n.name)}`),
  )
  diff(
    a.people,
    b.people,
    (n) => `Added ${q(n.name)}`,
    (o) => `Deleted ${q(o.name)}`,
    (o, n) => (n.favorite !== o.favorite ? `${n.favorite ? 'Favorited' : 'Unfavorited'} ${q(n.name)}` : `Edited ${q(n.name)}`),
  )
  const label = parts.length === 0 ? 'Change' : parts.length === 1 ? parts[0].label : parts.length <= 3 ? parts.map((p) => p.label).join(', ') : `${parts.length} changes`
  return { label, touched: parts.map((p) => p.id).sort() }
}

// record every change to the data
useStore.subscribe((s, prev) => {
  if (restoring || suppressed) return
  if (s.tasks === prev.tasks && s.folders === prev.folders && s.people === prev.people) return
  const before = snap(prev)
  const after = snap(s)
  if (same(before.tasks, after.tasks) && same(before.folders, after.folders) && same(before.people, after.people)) return // only a draft moved
  const { label, touched } = describe(before, after)
  const key = touched.join(',')
  const now = Date.now()
  const last = past.at(-1)
  if (last && last.touched === key && now - last.at < MERGE_MS) {
    // one gesture: keep the first "before", take the newest "after"
    last.after = after
    last.at = now
    last.label = label
    if (same(last.before.tasks, after.tasks) && same(last.before.folders, after.folders) && same(last.before.people, after.people)) past.pop() // ended where it started
  } else {
    past.push({ before, after, label, at: now, touched: key })
    if (past.length > MAX_STEPS) past.shift()
    // the slips people make: offer a way back right where they made them
    if (/^(Deleted|Checked off)/.test(label)) setTimeout(() => useStore.getState().showToast(label, { label: 'Undo', run: undo }), 0)
  }
  future = []
  publish()
})

/** Move just the things this step touched from one state to the other, leaving everything else (like another device's edits) alone. */
function patch<T extends { id: string }>(cur: T[], from: T[], to: T[]): T[] {
  if (from === to) return cur
  const f = new Map(from.map((i) => [i.id, i]))
  const t = new Map(to.map((i) => [i.id, i]))
  const changed = new Set<string>()
  for (const i of to) if (f.get(i.id) !== i) changed.add(i.id)
  for (const i of from) if (!t.has(i.id)) changed.add(i.id)
  if (!changed.size) return cur
  const out: T[] = []
  const seen = new Set<string>()
  for (const i of cur) {
    seen.add(i.id)
    if (!changed.has(i.id)) out.push(i)
    else if (t.has(i.id)) out.push(t.get(i.id)!)
  }
  for (const i of to) if (changed.has(i.id) && !seen.has(i.id)) out.push(i)
  return out
}

function apply(from: Snap, to: Snap) {
  restoring = true
  try {
    useStore.setState((s) => {
      const tasks = patch(s.tasks, from.tasks, to.tasks)
      const folders = patch(s.folders, from.folders, to.folders)
      return {
        tasks,
        folders,
        people: patch(s.people, from.people, to.people),
        // don't leave a panel or a filter pointing at something that no longer exists
        selectedId: tasks.some((t) => t.id === s.selectedId) ? s.selectedId : null,
        scope: s.scope.type === 'folder' && !folders.some((f) => f.id === (s.scope as { id: string }).id) ? { type: 'all' } : s.scope,
      }
    })
  } finally {
    restoring = false
  }
}

export function undo(): boolean {
  const e = past.pop()
  if (!e) return false
  apply(e.after, e.before)
  future.push(e)
  publish()
  useStore.getState().showToast(`Undid: ${e.label}`)
  return true
}

export function redo(): boolean {
  const e = future.pop()
  if (!e) return false
  apply(e.before, e.after)
  past.push(e)
  publish()
  useStore.getState().showToast(`Redid: ${e.label}`)
  return true
}
