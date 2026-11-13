// From the existing task map (groups, tasks) to what the workspace shows: which clusters, which tasks in them, and their places.
// Reads the task data; never writes to it.

import { childrenOf, pathOf } from '../core/folders'
import { hasProgress, progressOf } from '../core/progress'
import { isDoneNow } from '../core/recurrence'
import { dueInfo, dueLine } from '../core/rowModel'
import { effectiveUrgency } from '../core/tasks'
import type { Folder, Task } from '../core/types'
import { bubbleHue } from '../ui/pond/hue'
import { ensureLayout, LOOSE, type LayoutCluster, type LayoutTask } from './layout'
import type { SceneCluster, SceneTask } from './SpatialScene'
import type { SpatialLayoutData } from './types'

export const NONE = LOOSE

export interface SpatialContent {
  clusters: SceneCluster[]
  tasks: SceneTask[]
  layout: SpatialLayoutData
}

export function buildContent(visible: Task[], allTasks: Task[], folders: Folder[], stored: SpatialLayoutData): SpatialContent {
  const have = new Set(folders.map((f) => f.id))
  const clusterOf = (t: Task) => t.folderIds.find((id) => have.has(id)) ?? NONE
  // the clusters to show: every group with a task in it, and the groups above them (so the hierarchy reads)
  // Loose tasks are still members of Unsorted; their saved free positions only affect where they float, not where they belong.
  const hasUnsorted = visible.some((t) => clusterOf(t) === NONE)
  const shown = new Set<string>()
  if (hasUnsorted) shown.add(NONE)
  for (const t of visible) {
    const c = clusterOf(t)
    if (c === NONE) continue
    shown.add(c)
    for (const a of pathOf(folders, c)) shown.add(a.id)
  }
  // the order of the sidebar's tree, parents before children
  const order: string[] = []
  const walk = (parent: string | null) => {
    for (const f of childrenOf(folders, parent)) {
      order.push(f.id)
      walk(f.id)
    }
  }
  walk(null)
  const parentOf = (id: string): string | null => {
    if (id === NONE) return null
    const f = folders.find((x) => x.id === id)
    let p = f?.parentId ?? null
    while (p && !shown.has(p)) p = folders.find((x) => x.id === p)?.parentId ?? null
    return p
  }
  const counts = new Map<string, number>()
  for (const t of visible) counts.set(clusterOf(t), (counts.get(clusterOf(t)) ?? 0) + 1)
  const layoutClusters: LayoutCluster[] = [
    ...order.filter((id) => shown.has(id)).map((id, i) => ({ id, parent: parentOf(id), depth: pathOf(folders, id).length - 1, order: i + (hasUnsorted ? 1 : 0) })),
    ...(hasUnsorted ? [{ id: NONE, parent: null, depth: 0, order: 0 }] : []),
  ]
  const layoutTasks: LayoutTask[] = visible.map((t) => ({ id: t.id, cluster: clusterOf(t) }))
  const layout = ensureLayout(stored, {
    clusters: layoutClusters,
    tasks: layoutTasks,
    allTaskIds: new Set(allTasks.map((t) => t.id)),
    allClusterIds: new Set([...have, NONE]),
  })
  const clusters: SceneCluster[] = layoutClusters.map((c) => {
    const f = folders.find((x) => x.id === c.id)
    return { id: c.id, parent: c.parent, name: f?.name ?? 'Unsorted', hue: f?.hue ?? 285, shape: f?.shape, count: counts.get(c.id) ?? 0, depth: c.depth }
  })
  const tasks: SceneTask[] = visible.map((t) => {
    const due = dueInfo(t)
    return {
      id: t.id,
      cluster: clusterOf(t),
      title: t.title,
      imageUrl: t.image ?? null,
      hue: bubbleHue(t, folders),
      done: isDoneNow(t),
      due: due ? dueLine(due) : null,
      dueTone: due?.tone,
      urgency: effectiveUrgency(t),
      progress: hasProgress(t.kind) ? progressOf(t) : undefined,
    }
  })
  return { clusters, tasks, layout }
}

/** Whether two layouts say the same (so a layout is only stored when it changed). */
export const sameLayout = (a: SpatialLayoutData, b: SpatialLayoutData): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)
