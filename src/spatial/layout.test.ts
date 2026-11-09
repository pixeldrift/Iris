import { describe, expect, it } from 'vitest'
import { K, WORLD, type ClusterPlacement } from './types'
import { ensureLayout, slotAt, withRadius, fromRadius, separate, repose, lookAt, moveCluster, moveTask, planeBasis, taskWorld, type LayoutInput } from './layout'
import type { SpatialLayoutData } from './types'

const empty: SpatialLayoutData = { clusters: {}, tasks: {} }
const input = (tasks: Record<string, string[]>, extra: Partial<LayoutInput> = {}): LayoutInput => {
  const ids = Object.keys(tasks)
  const all = ids.flatMap((c) => tasks[c])
  return {
    clusters: ids.map((id, i) => ({ id, parent: null, depth: 0, order: i })),
    tasks: ids.flatMap((c) => tasks[c].map((id) => ({ id, cluster: c }))),
    allTaskIds: new Set(all),
    allClusterIds: new Set(ids),
    ...extra,
  }
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('spatial layout', () => {
  it('gives every cluster and task a place, with no two cards on top of each other', () => {
    const l = ensureLayout(empty, input({ school: ['a', 'b', 'c', 'd', 'e'], home: ['f', 'g'] }))
    expect(Object.keys(l.clusters).sort()).toEqual(['home', 'school'])
    const spots = Object.values(l.tasks).map((t) => taskWorld(t, l.clusters[t.c]))
    expect(spots).toHaveLength(7)
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(dist(spots[i], spots[j])).toBeGreaterThan(0.5)
  })
  it('puts clusters on a ring around the viewer, facing the middle, the first ones straight ahead', () => {
    const l = ensureLayout(empty, input({ one: ['a'] }))
    const c = l.clusters.one
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(80, 1)
    expect(c.z).toBeLessThan(0) // in front (down -Z)
    expect(Math.abs(c.x)).toBeLessThan(1)
    // facing the middle: the plane's normal points back toward the origin
    expect(Math.sin(c.ry) * c.x + Math.cos(c.ry) * c.z).toBeLessThan(0)
  })
  it('keeps every place when tasks are added, completed (hidden) or removed', () => {
    const first = ensureLayout(empty, input({ school: ['a', 'b', 'c'] }))
    const more = ensureLayout(first, input({ school: ['a', 'b', 'c', 'd'] }))
    for (const id of ['a', 'b', 'c']) expect(more.tasks[id]).toEqual(first.tasks[id])
    expect(more.tasks.d.slot).toBe(3)
    // b is hidden for now (completed, filtered out) but still exists: its place is kept
    const hidden = ensureLayout(more, input({ school: ['a', 'c', 'd'] }, { allTaskIds: new Set(['a', 'b', 'c', 'd']) }))
    expect(hidden.tasks.b).toEqual(first.tasks.b)
    // b is really gone: its slot is the first one a new task takes
    const gone = ensureLayout(hidden, input({ school: ['a', 'c', 'd', 'e'] }, { allTaskIds: new Set(['a', 'c', 'd', 'e']) }))
    expect(gone.tasks.b).toBeUndefined()
    expect(gone.tasks.e.slot).toBe(first.tasks.b.slot)
  })
  it('adds a new cluster beside the old ones without moving them', () => {
    const first = ensureLayout(empty, input({ school: ['a'], home: ['b'] }))
    const second = ensureLayout(first, input({ school: ['a'], home: ['b'], life: ['c'] }))
    expect(second.clusters.school).toEqual(first.clusters.school)
    expect(second.clusters.home).toEqual(first.clusters.home)
    // on the same row to the right if there is room, otherwise on a new row below
    const life = second.clusters.life
    expect(life.a > first.clusters.home.a || life.y < first.clusters.home.y).toBe(true)
  })
  it('links a subgroup to its group, on the same cylinder', () => {
    const inp = input({ school: ['a'], eng: ['b'] })
    inp.clusters = [
      { id: 'school', parent: null, depth: 0, order: 0 },
      { id: 'eng', parent: 'school', depth: 1, order: 1 },
    ]
    const l = ensureLayout(empty, inp)
    expect(l.clusters.eng.r).toBeCloseTo(l.clusters.school.r, 5)
    expect(l.clusters.eng.parent).toBe('school')
  })
  it('re-slots a task that moves to another group, and moves clusters and tasks by world position', () => {
    const first = ensureLayout(empty, input({ a: ['t'], b: ['u'] }))
    const moved = ensureLayout(first, input({ a: [], b: ['u', 't'] }))
    expect(moved.tasks.t.c).toBe('b')
    const c = first.clusters.a
    const c2 = moveCluster(c, [4, 1, -4])
    expect(c2.r).toBeCloseTo(c.r, 5) // (it stays pinned to the cylinder; only its direction and height change)
    expect(c2.a).toBeCloseTo(Math.PI / 4, 5)
    expect(c2.y).toBeCloseTo(1, 5)
    const t2 = moveTask(first.tasks.t, c2, taskWorld({ ...first.tasks.t, u: 0.7, v: -0.9 }, c2))
    expect(t2.u).toBeCloseTo(0.7, 5)
    expect(t2.v).toBeCloseTo(-0.9, 5)
    expect(lookAt(c2).yaw).toBeCloseTo(-Math.PI / 4, 5)
  })

  it('starts every group within a wide stretch straight ahead (70 degrees each side; none behind the viewer), on rows below when there are many', () => {
    const many: Record<string, string[]> = {}
    for (let i = 0; i < 12; i++) many[`g${i}`] = Array.from({ length: 1 + (i % 5) }, (_, k) => `t${i}-${k}`)
    const l = ensureLayout(empty, input(many))
    for (const c of Object.values(l.clusters)) {
      expect(Math.abs(c.a)).toBeLessThanOrEqual((Math.PI * 11) / 36 + 1e-6)
      expect(c.z).toBeLessThan(0) // in front
    }
    expect(Math.max(...Object.values(l.clusters).map((c) => c.tier ?? 0))).toBeGreaterThan(0)
  })
  it('never lets two groups (or their cards) overlap', () => {
    const many: Record<string, string[]> = {}
    for (let i = 0; i < 14; i++) many[`g${i}`] = Array.from({ length: 1 + ((i * 7) % 11) }, (_, k) => `t${i}-${k}`)
    const inp = input(many)
    // two of them are subgroups (nearer)
    inp.clusters = inp.clusters.map((c, i) => (i === 3 || i === 8 ? { ...c, parent: 'g0', depth: 1 } : c))
    const l = ensureLayout(empty, inp)
    const cellW = WORLD.cardW + WORLD.gap
    const cellH = WORLD.cardH + WORLD.gap
    const boxes = Object.entries(l.clusters).map(([id, c]) => {
      const n = many[id].length
      const rows = Math.ceil(n / c.cols)
      const half = (c.cols * cellW) / 2
      const tx = Math.cos(c.ry)
      const tz = -Math.sin(c.ry)
      return { id, ax: c.x - tx * half, az: c.z - tz * half, bx: c.x + tx * half, bz: c.z + tz * half, top: c.y + 0.5 * K, bottom: c.y - rows * cellH }
    })
    const ccw = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => (cz - az) * (bx - ax) > (bz - az) * (cx - ax)
    const cross = (p: (typeof boxes)[number], q: (typeof boxes)[number]) => ccw(p.ax, p.az, q.ax, q.az, q.bx, q.bz) !== ccw(p.bx, p.bz, q.ax, q.az, q.bx, q.bz) && ccw(p.ax, p.az, p.bx, p.bz, q.ax, q.az) !== ccw(p.ax, p.az, p.bx, p.bz, q.bx, q.bz)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const verticalOverlap = boxes[i].top > boxes[j].bottom && boxes[j].top > boxes[i].bottom
        if (verticalOverlap) expect(cross(boxes[i], boxes[j])).toBe(false)
      }
  })
  it('adds a new group under the old ones when a row is full, without moving anything', () => {
    const base: Record<string, string[]> = { a: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], b: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] }
    const first = ensureLayout(empty, input(base))
    const next = ensureLayout(first, input({ ...base, c: ['c1', 'c2'], d: ['d1'] }))
    for (const id of ['a', 'b']) expect(next.clusters[id]).toEqual(first.clusters[id])
    expect(Math.abs(next.clusters.c.a)).toBeLessThanOrEqual((Math.PI * 11) / 36 + 1e-6)
    expect(next.clusters.c.z).toBeLessThan(0)
  })

  it('stands each group upright facing the eye, so none is seen at a steep angle, and keeps its cards on that tilted plane', () => {
    const many: Record<string, string[]> = {}
    for (let i = 0; i < 9; i++) many[`g${i}`] = Array.from({ length: 4 }, (_, k) => `t${i}-${k}`)
    const l = ensureLayout(empty, input(many))
    for (const c of Object.values(l.clusters)) {
      const bs = planeBasis(c)
      const mid = [c.x - bs.up[0] * (c.half ?? 0), c.y - bs.up[1] * (c.half ?? 0), c.z - bs.up[2] * (c.half ?? 0)]
      const len = Math.hypot(mid[0], mid[1], mid[2])
      // the plane's normal points back at the viewer: the cosine between it and the way to the eye is nearly 1
      const facing = -(bs.normal[0] * mid[0] + bs.normal[1] * mid[1] + bs.normal[2] * mid[2]) / len
      expect(facing).toBeGreaterThan(0.8)
    }
    // a card's own place is on its plane
    for (const t of Object.values(l.tasks)) {
      const c = l.clusters[t.c]
      const w = taskWorld(t, c)
      const bs = planeBasis(c)
      const off = (w[0] - c.x) * bs.normal[0] + (w[1] - c.y) * bs.normal[1] + (w[2] - c.z) * bs.normal[2]
      expect(Math.abs(off)).toBeLessThan(1e-6)
    }
  })
  it('bends the same layout to another radius without changing sizes or overlap, and back again', () => {
    const l = ensureLayout(empty, input({ a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1'] }))
    for (const r of [30, 80, 150]) {
      const v = withRadius(l, r)
      const back = fromRadius(v, r)
      for (const [id, c] of Object.entries(v.clusters)) {
        expect(c.r).toBe(r)
        expect(Math.hypot(c.x, c.z)).toBeCloseTo(r, 6)
        expect(back.clusters[id].a).toBeCloseTo(l.clusters[id].a, 9)
        // arc length (what the spacing is measured in) does not change
        expect(c.a * c.r).toBeCloseTo(l.clusters[id].a * l.clusters[id].r, 6)
        expect(c.rx ?? 0).toBe(0)
      }
    }
  })
  it('draws a tree like an org chart: each group is centred over its subgroups, on the row below it', () => {
    const l = ensureLayout(empty, {
      clusters: [
        { id: 'p', parent: null, depth: 0, order: 0 },
        { id: 'c1', parent: 'p', depth: 1, order: 1 },
        { id: 'c2', parent: 'p', depth: 1, order: 2 },
        { id: 'q', parent: null, depth: 0, order: 3 },
      ],
      tasks: ['p', 'c1', 'c2', 'q'].map((c) => ({ id: `t-${c}`, cluster: c })),
      allTaskIds: new Set(['t-p', 't-c1', 't-c2', 't-q']),
      allClusterIds: new Set(['p', 'c1', 'c2', 'q']),
    })
    const { p, c1, c2, q } = l.clusters
    expect(p.a).toBeCloseTo((c1.a + c2.a) / 2, 6)
    expect(c1.y).toBeLessThan(p.y)
    expect(c1.y).toBeCloseTo(c2.y, 6)
    expect(q.y).toBeCloseTo(p.y, 6)
  })
  it('pushes overlapping groups apart (the pinned one stays), and leaves ones that do not overlap alone', () => {
    const l = ensureLayout(empty, input({ a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1'] }))
    const A = l.clusters.a
    // drop b right on top of a
    const stacked: Record<string, ClusterPlacement> = { ...l.clusters, b: repose(l.clusters.b, A.a, A.y) }
    const apart = separate(stacked, new Set(['a']))
    expect(apart.a).toEqual(stacked.a) // (pinned)
    const gap = Math.hypot(apart.b.x - A.x, apart.b.y - A.y, apart.b.z - A.z)
    expect(gap).toBeGreaterThan(Math.hypot(stacked.b.x - A.x, stacked.b.y - A.y, stacked.b.z - A.z))
    // groups already apart are not moved
    const same = separate(l.clusters)
    for (const id of Object.keys(l.clusters)) expect(same[id]).toEqual(l.clusters[id])
  })
  it('lays groups out as a family tree: a subgroup is on the row below its group, near under it', () => {
    const inp = input({ school: ['a'], eng: ['b', 'c'], bio: ['d'], home: ['e'] })
    inp.clusters = [
      { id: 'school', parent: null, depth: 0, order: 0 },
      { id: 'eng', parent: 'school', depth: 1, order: 1 },
      { id: 'bio', parent: 'school', depth: 1, order: 2 },
      { id: 'home', parent: null, depth: 0, order: 3 },
    ]
    const l = ensureLayout(empty, inp)
    expect(l.clusters.eng.y).toBeLessThan(l.clusters.school.y)
    expect(l.clusters.bio.y).toBeLessThan(l.clusters.school.y)
    expect(l.clusters.home.y).toBeCloseTo(l.clusters.school.y, 6) // (top-level groups share the first row)
    // the two subgroups sit around the middle of their group
    const mid = (l.clusters.eng.a + l.clusters.bio.a) / 2
    expect(Math.abs(mid - l.clusters.school.a)).toBeLessThan(0.5)
  })
  it('a task pulled out floats where it was dropped and leaves its slot free; dropping it into a group slots it', () => {
    const first = ensureLayout(empty, input({ a: ['a1', 'a2'], b: ['b1'] }))
    const pulled = { ...first, tasks: { ...first.tasks, a1: { ...first.tasks.a1, free: { a: 0.3, y: 1 } } } }
    const again = ensureLayout(pulled, input({ a: ['a1', 'a2'], b: ['b1'] }))
    expect(again.tasks.a1.free).toEqual({ a: 0.3, y: 1 })
    const dropped = ensureLayout(again, input({ a: ['a2'], b: ['b1', 'a1'] })) // (a1 was dropped into b)
    expect(dropped.tasks.a1.c).toBe('b')
    expect(dropped.tasks.a1.free).toBeUndefined()
  })
})


import { linkGeometry } from './links'

describe('connector ribbons', () => {
  it('are finite, and every branch runs downhill from its group to its subgroup', () => {
    const l = ensureLayout(empty, {
      clusters: [
        { id: 'p', parent: null, depth: 0, order: 0 },
        { id: 'c', parent: 'p', depth: 1, order: 1 },
      ],
      tasks: [{ id: 't1', cluster: 'p' }, { id: 't2', cluster: 'c' }],
      allTaskIds: new Set(['t1', 't2']),
      allClusterIds: new Set(['p', 'c']),
    })
    const g = linkGeometry([{ id: 'p', parent: null, hue: 200 }, { id: 'c', parent: 'p', hue: 300 }], l.clusters)!
    expect(g.pos.length).toBeGreaterThan(0)
    expect(g.pos.every(Number.isFinite)).toBe(true)
    // the first ribbon vertices (the start) are higher than the last (the end)
    const ys = g.pos.filter((_, i) => i % 3 === 1)
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1])
    expect(linkGeometry([{ id: 'p', parent: null, hue: 200 }], l.clusters)).toBeNull() // (no subgroups: nothing to draw)
  })
})

import { FREE_GRID, GROUP_GRID, nearestFreeSlot, snapFree, tidyClusters, tidyEverything } from './layout'

describe('keeping tidy', () => {
  it('snaps a group onto the grid and keeps it clear of the others (which are snapped too)', () => {
    const l = ensureLayout(empty, input({ a: ['a1', 'a2'], b: ['b1', 'b2'], c: ['c1'] }))
    const ids = Object.keys(l.clusters)
    const moved = { ...l.clusters, [ids[0]]: repose(l.clusters[ids[0]], l.clusters[ids[0]].a + 0.013, l.clusters[ids[0]].y + 0.4) }
    const out = tidyClusters(moved, new Set([ids[0]]))
    const c = out[ids[0]]
    expect(Math.abs(((c.a * c.r) / GROUP_GRID.x) % 1)).toBeLessThan(1e-6)
    expect(Math.abs((c.y / GROUP_GRID.y) % 1)).toBeLessThan(1e-6)
    // no overlap afterwards: separating again changes nothing
    const again = separate(out)
    for (const id of ids) expect(again[id].a).toBeCloseTo(out[id].a, 9)
  })
  it('finds the nearest free slot, skipping taken ones, and returns where it puts the card', () => {
    const cols = 2
    const n = nearestFreeSlot(new Set([0]), cols, slotAt(0, cols).u + 0.1, slotAt(0, cols).v) // wants slot 0, which is taken
    expect([1, 2]).toContain(n.slot)
    expect(n.u).toBeCloseTo(slotAt(n.slot, cols).u, 9)
    expect(nearestFreeSlot(new Set(), cols, slotAt(3, cols).u + 0.2, slotAt(3, cols).v - 0.2).slot).toBe(3)
  })
  it('snaps floating cards to the free grid', () => {
    const f = snapFree({ a: 0.1234, y: 3.3 })
    expect(Math.abs(((f.a * WORLD.ring) / FREE_GRID.x) % 1)).toBeLessThan(1e-6)
    expect(Math.abs((f.y / FREE_GRID.y) % 1)).toBeLessThan(1e-6)
  })
  it('tidies a whole layout: cards on slots, none doubled up, groups on the grid', () => {
    const l = ensureLayout(empty, input({ a: ['a1', 'a2', 'a3'], b: ['b1'] }))
    const mess = { ...l, tasks: Object.fromEntries(Object.entries(l.tasks).map(([id, t]) => [id, { ...t, u: t.u + 0.7, v: t.v - 0.5 }])) }
    const out = tidyEverything(mess)
    const seen = new Set<string>()
    for (const [id, t] of Object.entries(out.tasks)) {
      const key = `${t.c}:${t.slot}`
      expect(seen.has(key), id).toBe(false)
      seen.add(key)
      expect(t.u).toBeCloseTo(slotAt(t.slot, out.clusters[t.c].cols).u, 9)
    }
    for (const c of Object.values(out.clusters)) expect(Math.abs(((c.a * c.r) / GROUP_GRID.x) % 1) < 1e-6 || Math.abs(Math.abs(((c.a * c.r) / GROUP_GRID.x) % 1) - 1) < 1e-6).toBe(true)
  })
})
