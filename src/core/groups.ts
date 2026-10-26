import { diffDays, today } from './dates'
import { pathOf } from './folders'
import type { Folder, Person, PondGroup, Task } from './types'

export interface Group {
  key: string
  label: string
  taskIds: string[]
  /** The group's own colour (a folder's or person's hue), when it has one. */
  hue?: number
}

const KIND_LABELS = { task: 'Tasks', idea: 'Ideas', reminder: 'Reminders' } as const

function bucket(t: Task, ctx: { folders: Folder[]; people: Person[]; now: string }, mode: PondGroup): [string, string, number, number?] {
  switch (mode) {
    case 'folder': {
      const f = t.folderIds[0]
      if (!f) return ['none', 'Unfiled', 99]
      const root = pathOf(ctx.folders, f)[0]
      return root ? [root.id, root.name, root.sort, root.hue] : ['none', 'Unfiled', 99]
    }
    case 'person': {
      const p = ctx.people.find((x) => x.id === t.personIds[0])
      return p ? [p.id, p.name, 0, p.hue] : ['none', 'Just me', 99]
    }
    case 'due': {
      const when = t.due ?? t.day
      if (!when) return ['someday', 'Someday', 4]
      const d = diffDays(ctx.now, when)
      if (d < 0) return ['late', 'Overdue', 0]
      if (d === 0) return ['today', 'Today', 1]
      if (d <= 7) return ['week', 'This week', 2]
      return ['later', 'Later', 3]
    }
    case 'kind':
      return [t.kind, KIND_LABELS[t.kind], ['task', 'idea', 'reminder'].indexOf(t.kind)]
    default:
      return ['all', '', 0]
  }
}

export function groupTasks(tasks: Task[], mode: PondGroup, folders: Folder[], people: Person[], now = today()): Group[] {
  const map = new Map<string, Group & { order: number }>()
  for (const t of tasks) {
    const [key, label, order, hue] = bucket(t, { folders, people, now }, mode)
    const g = map.get(key) ?? { key, label, taskIds: [], order, hue }
    g.taskIds.push(t.id)
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

/**
 * Centres (px, relative to the middle of the layout) for clusters of the given
 * radii. Columns and rows are only as wide/tall as their biggest cluster, so
 * small clusters tuck in close without ever touching.
 */
export function layoutClusters(radii: number[], aspect: number, gap = 44): { x: number; y: number }[] {
  const n = radii.length
  if (!n) return []
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect))))
  const rows = Math.ceil(n / cols)
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...radii.filter((_, i) => i % cols === c)) * 2 + gap)
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...radii.slice(r * cols, r * cols + cols)) * 2 + gap)
  const xs: number[] = []
  let x = 0
  for (const w of colW) {
    xs.push(x + w / 2)
    x += w
  }
  const ys: number[] = []
  let y = 0
  for (const h of rowH) {
    ys.push(y + h / 2)
    y += h
  }
  return radii.map((_, i) => ({ x: xs[i % cols] - x / 2, y: ys[Math.floor(i / cols)] - y / 2 }))
}

/** Which tasks are related: they share a folder or a person. Keys are `pairKey(a, b)`. */
export function relations(tasks: Task[]): { related: Set<string> } {
  const byTag = new Map<string, Task[]>()
  for (const t of tasks) {
    for (const f of t.folderIds) byTag.set(`f${f}`, [...(byTag.get(`f${f}`) ?? []), t])
    for (const p of t.personIds) byTag.set(`p${p}`, [...(byTag.get(`p${p}`) ?? []), t])
  }
  const related = new Set<string>()
  for (const members of byTag.values()) {
    const ms = members.slice(0, 40)
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) related.add(pairKey(ms[i].id, ms[j].id))
  }
  return { related }
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
