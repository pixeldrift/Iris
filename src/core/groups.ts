import { diffDays, today } from './dates'
import { pathOf } from './folders'
import { weightOf } from './tasks'
import type { Folder, Person, PondGroup, Task } from './types'

export interface Group {
  key: string
  label: string
  taskIds: string[]
}

const WEIGHT_LABELS = ['Weighty', 'Steady', 'Feather-light']
const STAGE_LABELS = { todo: 'Seeds', doing: 'Growing', done: 'Bloomed' } as const
const KIND_LABELS = { task: 'Tasks', idea: 'Ideas', reminder: 'Reminders' } as const

function bucket(t: Task, ctx: { folders: Folder[]; people: Person[]; now: string }, mode: PondGroup): [string, string, number] {
  switch (mode) {
    case 'folder': {
      const f = t.folderIds[0]
      if (!f) return ['none', 'Unfiled', 99]
      const root = pathOf(ctx.folders, f)[0]
      return root ? [root.id, root.name, root.sort] : ['none', 'Unfiled', 99]
    }
    case 'person': {
      const p = ctx.people.find((x) => x.id === t.personIds[0])
      return p ? [p.id, p.name, 0] : ['none', 'Just me', 99]
    }
    case 'due': {
      if (!t.due) return ['someday', 'Someday', 4]
      const d = diffDays(ctx.now, t.due)
      if (d < 0) return ['late', 'Overdue', 0]
      if (d === 0) return ['today', 'Today', 1]
      if (d <= 7) return ['week', 'This week', 2]
      return ['later', 'Later', 3]
    }
    case 'weight': {
      const w = weightOf(t)
      const i = w > 0.62 ? 0 : w > 0.38 ? 1 : 2
      return [`w${i}`, WEIGHT_LABELS[i], i]
    }
    case 'kind':
      return [t.kind, KIND_LABELS[t.kind], ['task', 'idea', 'reminder'].indexOf(t.kind)]
    case 'stage':
      return [t.status, STAGE_LABELS[t.status], ['todo', 'doing', 'done'].indexOf(t.status)]
    default:
      return ['all', '', 0]
  }
}

export function groupTasks(tasks: Task[], mode: PondGroup, folders: Folder[], people: Person[], now = today()): Group[] {
  const map = new Map<string, Group & { order: number }>()
  for (const t of tasks) {
    const [key, label, order] = bucket(t, { folders, people, now }, mode)
    const g = map.get(key) ?? { key, label, taskIds: [], order }
    g.taskIds.push(t.id)
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

/**
 * Centres (px, relative to the middle of the layout) for clusters of the given
 * radii, in a loose grid with enough pitch that no two clusters touch.
 */
export function layoutClusters(radii: number[], aspect: number, gap = 110): { x: number; y: number }[] {
  const n = radii.length
  if (!n) return []
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect))))
  const rows = Math.ceil(n / cols)
  const pitch = 2 * Math.max(...radii) + gap
  return radii.map((_, i) => {
    const r = Math.floor(i / cols)
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols
    return { x: ((i % cols) - (inRow - 1) / 2) * pitch, y: (r - (rows - 1) / 2) * pitch * 0.92 }
  })
}

/**
 * Which tasks are related (share a folder or a person) and a sparse set of
 * "mind-map" links: within each tag every task links to its nearest earlier
 * neighbour, so clusters read as a tree rather than a hairball.
 */
export function relations(tasks: Task[]): { related: Set<string>; links: [string, string][] } {
  const byTag = new Map<string, Task[]>()
  for (const t of tasks) {
    for (const f of t.folderIds) byTag.set(`f${f}`, [...(byTag.get(`f${f}`) ?? []), t])
    for (const p of t.personIds) byTag.set(`p${p}`, [...(byTag.get(`p${p}`) ?? []), t])
  }
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const related = new Set<string>()
  const linked = new Set<string>()
  const links: [string, string][] = []
  for (const members of byTag.values()) {
    const ms = members.slice(0, 40)
    for (let i = 0; i < ms.length; i++) {
      let best = -1
      let bestD = Infinity
      for (let j = 0; j < ms.length; j++) {
        if (i === j) continue
        related.add(key(ms[i].id, ms[j].id))
        if (j < i) {
          const d = Math.hypot(ms[i].x - ms[j].x, ms[i].y - ms[j].y)
          if (d < bestD) {
            bestD = d
            best = j
          }
        }
      }
      if (best >= 0) {
        const k = key(ms[i].id, ms[best].id)
        if (!linked.has(k)) {
          linked.add(k)
          links.push([ms[i].id, ms[best].id])
        }
      }
    }
  }
  return { related, links }
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
