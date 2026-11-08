// SpatialLayout: turns the task map (groups and their tasks) into places in 3D, and keeps those places steady. Pure, with no
// rendering and no sensors, so every renderer (touch, motion, camera, and later ARKit) reads the same layout.

import { WORLD, type ClusterPlacement, type SpatialLayoutData, type TaskPlacement } from './types'

export interface LayoutCluster {
  id: string
  /** The parent group, when it is also shown. */
  parent: string | null
  /** Depth in the group tree (0 = top). */
  depth: number
  /** Order in the sidebar's tree (parents before children). */
  order: number
}
export interface LayoutTask {
  id: string
  cluster: string
}
export interface LayoutInput {
  clusters: LayoutCluster[]
  /** The tasks to show. */
  tasks: LayoutTask[]
  /** Every task that still exists (shown or not): a place is only given up when its task is really gone. */
  allTaskIds: ReadonlySet<string>
  allClusterIds: ReadonlySet<string>
}

const colsFor = (n: number) => Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, n) * 1.4))))
const cellW = WORLD.cardW + WORLD.gap
const cellH = WORLD.cardH + WORLD.gap
const slotAt = (slot: number, cols: number) => ({ u: ((slot % cols) - (cols - 1) / 2) * cellW, v: -(Math.floor(slot / cols) + 1) * cellH })

/** A cluster's place on the ring: faces the middle, with its grid roughly level with the eyes. */
/** Neighbouring clusters sit at different heights (level, high, low), so the whole sphere in front of a tall phone is used. */
const STAGGER = [0, 1.05, -0.85]
function place(a: number, r: number, cols: number, rows: number, parent: string | null, index = 0): ClusterPlacement {
  return { x: r * Math.sin(a), y: (rows * cellH) / 2 + 0.2 + STAGGER[index % STAGGER.length], z: -r * Math.cos(a), ry: -a, a, r, cols, parent }
}

/**
 * Give every shown cluster and task a place. Anything that already has one keeps it (so adding, completing or removing things
 * never moves what is left); new clusters take the next free stretch of the ring, new tasks the first free slot in their grid.
 */
export function ensureLayout(prev: SpatialLayoutData, input: LayoutInput): SpatialLayoutData {
  const clusters: Record<string, ClusterPlacement> = {}
  const tasks: Record<string, TaskPlacement> = {}
  // places are kept for anything that still exists, shown or not (hidden for now, or filtered out)
  for (const [id, p] of Object.entries(prev.clusters)) if (input.allClusterIds.has(id)) clusters[id] = p
  for (const [id, p] of Object.entries(prev.tasks)) if (input.allTaskIds.has(id)) tasks[id] = p

  const byCluster = new Map<string, LayoutTask[]>()
  for (const t of input.tasks) byCluster.set(t.cluster, [...(byCluster.get(t.cluster) ?? []), t])

  // new clusters, in tree order: a stretch of the ring each, side by side, subgroups a little nearer than their parents
  const arcOf = (cols: number) => cols * cellW + 0.9
  const fresh = input.clusters.filter((c) => !clusters[c.id]).sort((a, b) => a.order - b.order)
  if (fresh.length) {
    const taken = Object.values(clusters).map((c) => c.a)
    // an empty room starts centred on straight ahead; otherwise new ones go on after the furthest right
    const placed = fresh.reduce<{ id: string; w: number; cols: number; rows: number }[]>((acc, c) => {
      const n = byCluster.get(c.id)?.length ?? 1
      const cols = colsFor(n)
      acc.push({ id: c.id, w: arcOf(cols), cols, rows: Math.ceil(n / cols) })
      return acc
    }, [])
    const ringOf = (c: LayoutCluster) => WORLD.ring - c.depth * 0.7
    const total = placed.reduce((s, p) => s + p.w / WORLD.ring, 0)
    let a = taken.length ? Math.max(...taken) + 0.35 : -total / 2
    for (const p of placed) {
      const c = fresh.find((x) => x.id === p.id)!
      const r = ringOf(c)
      const span = p.w / r
      clusters[p.id] = place(a + span / 2, r, p.cols, p.rows, c.parent, Object.keys(clusters).length)
      a += span
    }
  }
  // a cluster's parent link follows the tree
  for (const c of input.clusters) if (clusters[c.id]) clusters[c.id] = { ...clusters[c.id], parent: c.parent }

  // new tasks: the first free slot in their cluster's grid
  const slotsTaken = new Map<string, Set<number>>()
  for (const [id, p] of Object.entries(tasks)) if (input.allTaskIds.has(id)) slotsTaken.set(p.c, (slotsTaken.get(p.c) ?? new Set()).add(p.slot))
  for (const t of input.tasks) {
    const have = tasks[t.id]
    if (have && have.c === t.cluster) continue
    if (have) slotsTaken.get(have.c)?.delete(have.slot) // moved to another group: its old slot is free
    const cl = clusters[t.cluster]
    if (!cl) continue
    const used = slotsTaken.get(t.cluster) ?? new Set<number>()
    let slot = 0
    while (used.has(slot)) slot++
    used.add(slot)
    slotsTaken.set(t.cluster, used)
    const { u, v } = slotAt(slot, cl.cols)
    tasks[t.id] = { c: t.cluster, u, v, dz: 0, slot }
  }
  return { clusters, tasks }
}

export type Vec3 = [number, number, number]

/** Where a task is in the world: its cluster's place, then across and down in the cluster's own plane. */
export function taskWorld(t: TaskPlacement, c: ClusterPlacement): Vec3 {
  const rx = Math.cos(c.ry)
  const rz = -Math.sin(c.ry)
  const nx = Math.sin(c.ry)
  const nz = Math.cos(c.ry)
  return [c.x + rx * t.u + nx * t.dz, c.y + t.v, c.z + rz * t.u + nz * t.dz]
}

/** Move a cluster (and so everything in it): its ring position follows, and it keeps facing the middle. */
export function moveCluster(c: ClusterPlacement, to: Vec3): ClusterPlacement {
  const a = Math.atan2(to[0], -to[2])
  return { ...c, x: to[0], y: to[1], z: to[2], a, r: Math.hypot(to[0], to[2]), ry: -a }
}

/** Move a task within its cluster: `world` is turned back into the cluster's own across/down. */
export function moveTask(t: TaskPlacement, c: ClusterPlacement, world: Vec3): TaskPlacement {
  const dx = world[0] - c.x
  const dz = world[2] - c.z
  return { ...t, u: dx * Math.cos(c.ry) + dz * -Math.sin(c.ry), v: world[1] - c.y }
}

/** The heading (radians) and height to look at to face a cluster. */
export const lookAt = (c: ClusterPlacement): { yaw: number; pitch: number } => ({ yaw: -c.a, pitch: Math.atan2(c.y - 0.5, Math.hypot(c.x, c.z)) })
