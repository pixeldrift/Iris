// SpatialLayout: turns the task map (groups and their tasks) into places in 3D, and keeps those places steady. Pure, with no
// rendering and no sensors, so every renderer (touch, motion, camera, and later ARKit) reads the same layout.

import { K, WORLD, type ClusterPlacement, type SpatialLayoutData, type TaskPlacement } from './types'

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

const colsFor = (n: number) => Math.max(1, Math.min(2, Math.ceil(Math.sqrt(Math.max(1, n) * 1.4))))
const cellW = WORLD.cardW + WORLD.gap
const cellH = WORLD.cardH + WORLD.gap
const slotAt = (slot: number, cols: number) => ({ u: ((slot % cols) - (cols - 1) / 2) * cellW, v: -(Math.floor(slot / cols) + 1) * cellH })

/** Groups start in a wide, shallow wall within 70 degrees either side of straight ahead (140 in all, a few phone screens across), so nothing begins behind the viewer. */
export const START_SPAN = (Math.PI * 7) / 9
const MARGIN = 1.1 * K // clear space between neighbouring groups
const TIER_HEAD = 1.9 * K // a group's name, and the gap above its cards

const widthOf = (cols: number) => cols * cellW + MARGIN
const heightOf = (rows: number) => rows * cellH + TIER_HEAD

/** A cluster's place on the cylinder: faces the eye; `top` is where its name sits, `rows` sizes its grid. */
function place(a: number, r: number, cols: number, top: number, parent: string | null, tier: number, rows = 1): ClusterPlacement {
  const half = (rows * cellH) / 2
  return tilt({ x: r * Math.sin(a), y: top, z: -r * Math.cos(a), ry: -a, a, r, cols, parent, tier, half })
}
/** Lean a group toward the eye: it faces the origin from where it is, both across and up or down. */
function tilt(c: ClusterPlacement): ClusterPlacement {
  const mid = c.y - (c.half ?? 0)
  return { ...c, rx: Math.atan2(mid, Math.hypot(c.x, c.z)) }
}

/**
 * Give every shown cluster and task a place. Anything that already has one keeps it (so adding, completing or removing things
 * never moves what is left). New groups are laid out left to right across a 90-degree stretch straight ahead, then on further rows
 * below (never round behind the viewer); new tasks take the first free slot in their group's grid.
 */
export function ensureLayout(prev: SpatialLayoutData, input: LayoutInput): SpatialLayoutData {
  const clusters: Record<string, ClusterPlacement> = {}
  const tasks: Record<string, TaskPlacement> = {}
  // places are kept for anything that still exists, shown or not (hidden for now, or filtered out)
  for (const [id, p] of Object.entries(prev.clusters)) if (input.allClusterIds.has(id)) clusters[id] = p
  for (const [id, p] of Object.entries(prev.tasks)) if (input.allTaskIds.has(id)) tasks[id] = p

  const byCluster = new Map<string, LayoutTask[]>()
  for (const t of input.tasks) byCluster.set(t.cluster, [...(byCluster.get(t.cluster) ?? []), t])
  const rowsOf = (id: string, cols: number) => Math.max(1, Math.ceil((byCluster.get(id)?.length ?? 1) / cols))

  const fresh = input.clusters.filter((c) => !clusters[c.id]).sort((a, b) => a.order - b.order)
  if (fresh.length) {
    const had = Object.entries(clusters)
    const sized = fresh.map((c) => {
      const cols = colsFor(byCluster.get(c.id)?.length ?? 1)
      const r = WORLD.ring // one cylinder for all of them (a nearer subgroup would loom over, and overlap, the group in front of it); a line joins it to its group
      return { c, cols, r, rows: rowsOf(c.id, cols), span: widthOf(cols) / r }
    })
    // which row and angle each new group takes
    let tier = 0
    let cursor = -START_SPAN / 2
    let rowCount = 0
    let belowAll = 0
    if (had.length) {
      tier = Math.max(...had.map(([, p]) => p.tier ?? 0))
      const row = had.filter(([, p]) => (p.tier ?? 0) === tier)
      rowCount = row.length
      cursor = Math.max(...row.map(([, p]) => p.a + widthOf(p.cols) / (2 * p.r)))
      belowAll = Math.min(...had.map(([id, p]) => p.y - heightOf(rowsOf(id, p.cols)))) // just under the lowest group so far
    }
    const lastTier = tier
    const placed: { id: string; a: number; r: number; cols: number; rows: number; tier: number; parent: string | null; span: number }[] = []
    for (const s of sized) {
      if (rowCount > 0 && cursor + s.span > START_SPAN / 2 + 1e-9) {
        // no room left on this row: start the next one below
        tier++
        cursor = -START_SPAN / 2
        rowCount = 0
      }
      placed.push({ id: s.c.id, a: cursor + s.span / 2, r: s.r, cols: s.cols, rows: s.rows, tier, parent: s.c.parent, span: s.span })
      cursor += s.span
      rowCount++
    }
    // a brand-new layout centres each row in the stretch straight ahead (a single group sits dead ahead)
    if (!had.length) {
      for (const t of new Set(placed.map((p) => p.tier))) {
        const row = placed.filter((p) => p.tier === t)
        const shift = (START_SPAN - row.reduce((sum, p) => sum + p.span, 0)) / 2
        for (const p of row) p.a += shift
      }
    }
    // heights: each row is as tall as its tallest group; a brand-new layout is centred on eye level, later groups go under the old ones
    const tiers = [...new Set(placed.map((p) => p.tier))].sort((x, y) => x - y)
    const tierH = new Map(tiers.map((t) => [t, Math.max(...placed.filter((p) => p.tier === t).map((p) => heightOf(p.rows)))]))
    const tierTop = new Map<number, number>()
    if (had.length) {
      const lastTop = Math.max(...had.filter(([, p]) => (p.tier ?? 0) === lastTier).map(([, p]) => p.y))
      let y = belowAll
      for (const t of tiers) {
        if (t === lastTier) tierTop.set(t, lastTop)
        else {
          tierTop.set(t, y)
          y -= tierH.get(t)!
        }
      }
    } else {
      const total = tiers.reduce((sum, t) => sum + tierH.get(t)!, 0)
      let y = total / 2 + 0.6 * K
      for (const t of tiers) {
        tierTop.set(t, y)
        y -= tierH.get(t)!
      }
    }
    for (const p of placed) clusters[p.id] = place(p.a, p.r, p.cols, tierTop.get(p.tier) as number, p.parent, p.tier, p.rows)
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

/** The directions of a group's plane in the world: across, up the card face, and out toward the viewer. */
export function planeBasis(c: Pick<ClusterPlacement, 'ry' | 'rx'>): { right: Vec3; up: Vec3; normal: Vec3 } {
  const th = c.rx ?? 0
  const sy = Math.sin(c.ry)
  const cy = Math.cos(c.ry)
  const st = Math.sin(th)
  const ct = Math.cos(th)
  // the rotation is the turn about the vertical (ry) applied after the tilt (rx): the plane's own axes are carried along
  return { right: [cy, 0, -sy], up: [st * sy, ct, st * cy], normal: [ct * sy, -st, ct * cy] }
}

/** Where a task is in the world: its cluster's place, then across and down (and out) in the cluster's own plane. */
export function taskWorld(t: TaskPlacement, c: ClusterPlacement): Vec3 {
  const { right, up, normal } = planeBasis(c)
  return [c.x + right[0] * t.u + up[0] * t.v + normal[0] * t.dz, c.y + right[1] * t.u + up[1] * t.v + normal[1] * t.dz, c.z + right[2] * t.u + up[2] * t.v + normal[2] * t.dz]
}

/** Move a cluster (and so everything in it): its ring position follows, and it keeps facing the eye. */
export function moveCluster(c: ClusterPlacement, to: Vec3): ClusterPlacement {
  const a = Math.atan2(to[0], -to[2])
  return tilt({ ...c, x: to[0], y: to[1], z: to[2], a, r: Math.hypot(to[0], to[2]), ry: -a })
}

/** Move a task within its cluster: `world` is turned back into the cluster's own across/down. */
export function moveTask(t: TaskPlacement, c: ClusterPlacement, world: Vec3): TaskPlacement {
  const { right, up } = planeBasis(c)
  const d: Vec3 = [world[0] - c.x, world[1] - c.y, world[2] - c.z]
  return { ...t, u: d[0] * right[0] + d[1] * right[1] + d[2] * right[2], v: d[0] * up[0] + d[1] * up[1] + d[2] * up[2] }
}

/** The heading (radians) and height to look at to face a cluster (its middle). */
export const lookAt = (c: ClusterPlacement): { yaw: number; pitch: number } => ({ yaw: -c.a, pitch: Math.atan2(c.y - (c.half ?? 0), Math.hypot(c.x, c.z)) })
