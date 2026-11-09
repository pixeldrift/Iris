// SpatialLayout: turns the task map (groups and their tasks) into places in 3D, and keeps those places steady. Pure, with no
// rendering and no sensors, so every renderer (touch, motion, camera, and later ARKit) reads the same layout.
//
// The picture: groups hang on one big, distant cylinder around the viewer, each leaning to face the eye. A subgroup sits on the row
// below its group (a family tree, top to bottom), and groups never overlap: when one is moved or grows, the others are pushed aside.

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

export const colsFor = (n: number) => Math.max(1, Math.min(2, Math.ceil(Math.sqrt(Math.max(1, n) * 1.4))))
export const cellW = WORLD.cardW + WORLD.gap
export const cellH = WORLD.cardH + WORLD.gap
export const slotAt = (slot: number, cols: number) => ({ u: ((slot % cols) - (cols - 1) / 2) * cellW, v: -(Math.floor(slot / cols) + 1) * cellH })

/** Groups start in a wide, shallow wall within 55 degrees either side of straight ahead (110 in all), so nothing begins behind the viewer. */
export const START_SPAN = (Math.PI * 11) / 18
const MARGIN = 1.1 * K // clear space between neighbouring groups
const TIER_HEAD = 2.3 * K // a group's name, and the gap above its cards

const widthOf = (cols: number) => cols * cellW + MARGIN
const heightOf = (rows: number) => rows * cellH + TIER_HEAD

/** A group's plane stands upright, facing the eye across (a gentle wall, not rolled over). */
export function tilt(c: ClusterPlacement): ClusterPlacement {
  const mid = c.y - (c.half ?? 0)
  // leaning most of the way to face the eye keeps text from being seen at a steep angle without every pane looking rolled over
  void mid
  return { ...c, rx: 0 }
}

/** The same group at another angle on the cylinder and height (its other numbers follow). */
export function repose(c: ClusterPlacement, a: number, y: number): ClusterPlacement {
  return tilt({ ...c, a, y, x: c.r * Math.sin(a), z: -c.r * Math.cos(a), ry: -a })
}

function place(a: number, r: number, cols: number, rows: number, top: number, parent: string | null, tier: number, depth: number): ClusterPlacement {
  return tilt({ x: r * Math.sin(a), y: top, z: -r * Math.cos(a), ry: -a, a, r, cols, parent, tier, depth, rows, half: (rows * cellH) / 2 })
}

/** The rectangle a group takes up on the cylinder (unrolled flat): across (arc length) and up/down, centred on its cards and name. */
function rectOf(c: ClusterPlacement) {
  const s = c.scale ?? 1
  const rows = c.rows ?? 1
  const w = (c.cols * cellW + MARGIN) * s
  const h = (rows * cellH + 1.1 * K + MARGIN * 0.6) * s
  return { cx: c.a * c.r, cy: c.y - (rows * cellH * s) / 2 + 0.3 * K * s, hw: w / 2, hh: h / 2 }
}

/**
 * Push overlapping groups apart. `pinned` ones stay where they are (the one being carried; or, when placing new groups, all the old
 * ones) and the rest give way along whichever way takes the least pushing. Groups that do not overlap are not touched at all.
 */
export function separate(clusters: Record<string, ClusterPlacement>, pinned: ReadonlySet<string> = new Set(), iterations = 24): Record<string, ClusterPlacement> {
  const out: Record<string, ClusterPlacement> = { ...clusters }
  const ids = Object.keys(out)
  const moved = new Set<string>()
  for (let it = 0; it < iterations; it++) {
    let any = false
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const A = out[ids[i]]
        const B = out[ids[j]]
        const ra = rectOf(A)
        const rb = rectOf(B)
        const dx = rb.cx - ra.cx
        const dy = rb.cy - ra.cy
        const ox = ra.hw + rb.hw - Math.abs(dx)
        const oy = ra.hh + rb.hh - Math.abs(dy)
        if (ox <= 1e-4 * K || oy <= 1e-4 * K) continue // (touching is not overlapping)
        any = true
        const pa = pinned.has(ids[i])
        const pb = pinned.has(ids[j])
        if (pa && pb) continue
        const shareA = pa ? 0 : pb ? 1 : 0.5
        const shareB = pb ? 0 : pa ? 1 : 0.5
        // the least pushing: sideways when that is shorter, otherwise up or down (a little extra so they stop touching)
        if (ox < oy * 1.4) {
          const push = (ox + 0.05 * K) * (dx >= 0 ? 1 : -1)
          out[ids[i]] = repose(A, A.a - (push * shareA) / A.r, A.y)
          out[ids[j]] = repose(B, B.a + (push * shareB) / B.r, B.y)
        } else {
          const push = (oy + 0.05 * K) * (dy >= 0 ? 1 : -1)
          out[ids[i]] = repose(A, A.a, A.y - push * shareA)
          out[ids[j]] = repose(B, B.a, B.y + push * shareB)
        }
        moved.add(ids[i])
        moved.add(ids[j])
      }
    if (!any) break
  }
  return out
}

/**
 * Give every shown cluster and task a place. Anything that already has one keeps it (so adding, completing or removing things
 * never moves what is left, unless a group that grew now overlaps its neighbour, which is then pushed aside). New groups are laid out
 * as a family tree: top-level groups along the first row, each subgroup on the row below its group, centred under it where there is
 * room, within a wide stretch straight ahead (never behind the viewer). New tasks take the first free slot in their group's grid.
 */
export function ensureLayout(prev: SpatialLayoutData, input: LayoutInput): SpatialLayoutData {
  let clusters: Record<string, ClusterPlacement> = {}
  const tasks: Record<string, TaskPlacement> = {}
  // places are kept for anything that still exists, shown or not (hidden for now, or filtered out)
  for (const [id, p] of Object.entries(prev.clusters)) if (input.allClusterIds.has(id)) clusters[id] = p
  for (const [id, p] of Object.entries(prev.tasks)) if (input.allTaskIds.has(id)) tasks[id] = p

  // the tasks that live in each group's grid (a task pulled out and floating does not take a slot)
  const inGrid = new Map<string, LayoutTask[]>()
  for (const t of input.tasks) {
    const own = tasks[t.id]
    if (own?.free && own.c === t.cluster) continue
    inGrid.set(t.cluster, [...(inGrid.get(t.cluster) ?? []), t])
  }
  const rowsOf = (id: string, cols: number) => Math.max(1, Math.ceil((inGrid.get(id)?.length ?? 1) / cols))

  const fresh = input.clusters.filter((c) => !clusters[c.id]).sort((a, b) => a.order - b.order)
  if (fresh.length) {
    const had = Object.entries(clusters)
    const sized = fresh.map((c) => {
      const cols = colsFor(inGrid.get(c.id)?.length ?? 1)
      return { c, cols, rows: rowsOf(c.id, cols), r: WORLD.ring, span: widthOf(cols) / WORLD.ring }
    })
    if (!had.length) {
      // a brand-new layout, drawn like an org chart: each group centred over its subgroups, which sit on the row below it. Top-level
      // groups go side by side across the stretch ahead; when they would run past it, the next ones start a new band underneath.
      const arc = START_SPAN * WORLD.ring
      const byId = new Map(sized.map((s) => [s.c.id, s]))
      const kids = new Map<string, typeof sized>()
      const roots: typeof sized = []
      for (const s of sized) {
        const par = s.c.parent && byId.has(s.c.parent) ? s.c.parent : null
        if (par) kids.set(par, [...(kids.get(par) ?? []), s])
        else roots.push(s)
      }
      const width = (s: (typeof sized)[number]): number => Math.max(widthOf(s.cols), (kids.get(s.c.id) ?? []).reduce((t, k) => t + width(k), 0))
      const bands: (typeof sized)[] = []
      let band: typeof sized = []
      let used = 0
      for (const r of roots) {
        const w = width(r)
        if (band.length && used + w > arc) {
          bands.push(band)
          band = []
          used = 0
        }
        band.push(r)
        used += w
      }
      if (band.length) bands.push(band)
      // rows: every group at the same depth in a band shares a row, as tall as its tallest
      type Spot = { s: (typeof sized)[number]; x: number; level: number }
      const spots: Spot[][] = []
      const levelH: number[][] = []
      for (const roots of bands) {
        const list: Spot[] = []
        const total = roots.reduce((t, r) => t + width(r), 0)
        const lay = (s: (typeof sized)[number], left: number, level: number) => {
          const w = width(s)
          list.push({ s, x: left + w / 2, level })
          let at = left + (w - (kids.get(s.c.id) ?? []).reduce((t, k) => t + width(k), 0)) / 2
          for (const k of kids.get(s.c.id) ?? []) {
            lay(k, at, level + 1)
            at += width(k)
          }
        }
        let at = -total / 2
        for (const r of roots) {
          lay(r, at, 0)
          at += width(r)
        }
        const hs: number[] = []
        for (const sp of list) hs[sp.level] = Math.max(hs[sp.level] ?? 0, heightOf(sp.s.rows))
        spots.push(list)
        levelH.push(hs)
      }
      const GAP = 0.6 * K
      const totalH = levelH.reduce((t, hs) => t + hs.reduce((a, b) => a + b, 0), 0) + GAP * (bands.length - 1)
      let y = totalH / 2 + 0.6 * K
      let tier = 0
      bands.forEach((_, bi) => {
        const rowY: number[] = []
        levelH[bi].forEach((h, lv) => {
          rowY[lv] = y
          y -= h
        })
        for (const sp of spots[bi]) clusters[sp.s.c.id] = place(sp.x / WORLD.ring, sp.s.r, sp.s.cols, sp.s.rows, rowY[sp.level], sp.s.c.parent, tier + sp.level, sp.s.c.depth)
        tier += levelH[bi].length
        y -= GAP
      })
    } else {
      // later groups: on the row of their depth if there is one, else a new row under everything; under their group where possible
      const placedNow = new Set<string>()
      for (const s of sized) {
        const sameDepth = had.filter(([, p]) => (p.depth ?? 0) === s.c.depth)
        const lowest = Math.min(...had.map(([, p]) => p.y - heightOf(p.rows ?? 1)))
        const tierOf = sameDepth.length ? (sameDepth[0][1].tier ?? 0) : Math.max(...had.map(([, p]) => p.tier ?? 0)) + 1
        const topY = sameDepth.length ? Math.max(...sameDepth.map(([, p]) => p.y)) : lowest
        const parentA = s.c.parent ? clusters[s.c.parent]?.a : undefined
        const rowEnd = sameDepth.length ? Math.max(...sameDepth.map(([, p]) => p.a + widthOf(p.cols) / (2 * p.r))) : -START_SPAN / 2
        const a = parentA ?? rowEnd + s.span / 2
        clusters[s.c.id] = place(a, s.r, s.cols, s.rows, topY, s.c.parent, tierOf, s.c.depth)
        placedNow.add(s.c.id)
      }
      // anything new that landed on something is pushed clear; the old ones stay where they are
      clusters = separate(clusters, new Set(Object.keys(clusters).filter((id) => !placedNow.has(id))))
    }
  }
  // the group tree and the size of each grid follow the tasks
  let grew = false
  for (const c of input.clusters) {
    const cur = clusters[c.id]
    if (!cur) continue
    const rows = rowsOf(c.id, cur.cols)
    if (rows !== cur.rows || cur.parent !== c.parent || cur.depth !== c.depth) {
      clusters[c.id] = tilt({ ...cur, rows, half: (rows * cellH) / 2, parent: c.parent, depth: c.depth })
      if (rows !== cur.rows) grew = true
    }
  }
  if (grew) clusters = separate(clusters)

  // new tasks: the first free slot in their cluster's grid
  const slotsTaken = new Map<string, Set<number>>()
  for (const [id, p] of Object.entries(tasks)) if (input.allTaskIds.has(id) && !p.free) slotsTaken.set(p.c, (slotsTaken.get(p.c) ?? new Set()).add(p.slot))
  for (const t of input.tasks) {
    const have = tasks[t.id]
    if (have && have.c === t.cluster) continue
    if (have && !have.free) slotsTaken.get(have.c)?.delete(have.slot) // moved to another group: its old slot is free
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
  const s = c.scale ?? 1
  const [u, v, d] = [t.u * s, t.v * s, t.dz * s]
  return [c.x + right[0] * u + up[0] * v + normal[0] * d, c.y + right[1] * u + up[1] * v + normal[1] * d, c.z + right[2] * u + up[2] * v + normal[2] * d]
}

/** A task pulled out of its group floats on the cylinder, a little in front of the groups; this is where, and how it faces. */
export function freePose(t: TaskPlacement, radius: number = WORLD.ring): { pos: Vec3; ry: number; rx: number } | null {
  if (!t.free) return null
  const r = radius * 0.94
  return { pos: [r * Math.sin(t.free.a), t.free.y, -r * Math.cos(t.free.a)], ry: -t.free.a, rx: Math.atan2(t.free.y, r) }
}
/** The angle and height on the cylinder of a point in the world (where a dropped task floats). */
export const onCylinder = (p: Vec3): { a: number; y: number } => ({ a: Math.atan2(p[0], -p[2]), y: p[1] })

/** Move a cluster (and so everything in it) to a world position: its place on the cylinder follows, and it keeps facing the eye. */
export function moveCluster(c: ClusterPlacement, to: Vec3): ClusterPlacement {
  return repose(c, Math.atan2(to[0], -to[2]), to[1])
}

/** Move a task within its cluster: `world` is turned back into the cluster's own across/down. */
export function moveTask(t: TaskPlacement, c: ClusterPlacement, world: Vec3): TaskPlacement {
  const { right, up } = planeBasis(c)
  const s = c.scale ?? 1
  const d: Vec3 = [world[0] - c.x, world[1] - c.y, world[2] - c.z]
  return { ...t, u: (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / s, v: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / s }
}

/** Where, in a cluster's own plane, a world point falls (across, down); and whether that is on its pane. */
export function localIn(c: ClusterPlacement, world: Vec3): { u: number; v: number } {
  const { right, up } = planeBasis(c)
  const s = c.scale ?? 1
  const d: Vec3 = [world[0] - c.x, world[1] - c.y, world[2] - c.z]
  return { u: (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / s, v: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / s }
}
/** The pane of a cluster, in its own units: across from `u0` to `u1`, down from `v1` (top) to `v0`. */
export function paneOf(c: ClusterPlacement): { u0: number; u1: number; v0: number; v1: number } {
  const w = (c.cols * cellW + MARGIN * 0.5) / 2
  const rows = c.rows ?? 1
  return { u0: -w, u1: w, v0: -(rows * cellH + 0.4 * K), v1: -0.3 * K }
}

/** The heading (radians) and height to look at to face a cluster (its middle). */
export const lookAt = (c: ClusterPlacement): { yaw: number; pitch: number } => ({ yaw: -c.a, pitch: Math.atan2(c.y - (c.half ?? 0) * (c.scale ?? 1), Math.hypot(c.x, c.z)) })


/**
 * The cylinder's radius is a surface to hang the layout on: sizes and arc-length spacing stay the same, so a smaller radius only curls
 * the wall around you more and a larger one flattens it. The stored layout is always at the reference radius; these convert both ways.
 */
export function withRadius(l: SpatialLayoutData, r: number): SpatialLayoutData {
  if (Math.abs(r - WORLD.ring) < 1e-9) return l
  const k = WORLD.ring / r
  const clusters: Record<string, ClusterPlacement> = {}
  for (const [id, c] of Object.entries(l.clusters)) clusters[id] = repose({ ...c, r }, c.a * k, c.y)
  const tasks: Record<string, TaskPlacement> = {}
  for (const [id, t] of Object.entries(l.tasks)) tasks[id] = t.free ? { ...t, free: { a: t.free.a * k, y: t.free.y } } : t
  return { clusters, tasks }
}
export function fromRadius(l: SpatialLayoutData, r: number): SpatialLayoutData {
  if (Math.abs(r - WORLD.ring) < 1e-9) return l
  const k = r / WORLD.ring
  const clusters: Record<string, ClusterPlacement> = {}
  for (const [id, c] of Object.entries(l.clusters)) clusters[id] = repose({ ...c, r: WORLD.ring }, c.a * k, c.y)
  const tasks: Record<string, TaskPlacement> = {}
  for (const [id, t] of Object.entries(l.tasks)) tasks[id] = t.free ? { ...t, free: { a: t.free.a * k, y: t.free.y } } : t
  return { clusters, tasks }
}
/** The radius the testing slider offers (the default is the reference radius). */
export const RADIUS = { start: 200, min: 25, max: 250 }
