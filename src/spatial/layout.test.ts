import { describe, expect, it } from 'vitest'
import { ensureLayout, lookAt, moveCluster, moveTask, taskWorld, type LayoutInput } from './layout'
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
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(4.4, 1)
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
    expect(second.clusters.life.a).toBeGreaterThan(first.clusters.home.a)
  })
  it('puts a subgroup a little nearer than its parent, and links it', () => {
    const inp = input({ school: ['a'], eng: ['b'] })
    inp.clusters = [
      { id: 'school', parent: null, depth: 0, order: 0 },
      { id: 'eng', parent: 'school', depth: 1, order: 1 },
    ]
    const l = ensureLayout(empty, inp)
    expect(l.clusters.eng.r).toBeLessThan(l.clusters.school.r)
    expect(l.clusters.eng.parent).toBe('school')
  })
  it('re-slots a task that moves to another group, and moves clusters and tasks by world position', () => {
    const first = ensureLayout(empty, input({ a: ['t'], b: ['u'] }))
    const moved = ensureLayout(first, input({ a: [], b: ['u', 't'] }))
    expect(moved.tasks.t.c).toBe('b')
    const c = first.clusters.a
    const c2 = moveCluster(c, [4, 1, -4])
    expect(c2.r).toBeCloseTo(Math.hypot(4, 4), 5)
    expect(c2.a).toBeCloseTo(Math.PI / 4, 5)
    const t2 = moveTask(first.tasks.t, c2, taskWorld({ ...first.tasks.t, u: 0.7, v: -0.9 }, c2))
    expect(t2.u).toBeCloseTo(0.7, 5)
    expect(t2.v).toBeCloseTo(-0.9, 5)
    expect(lookAt(c2).yaw).toBeCloseTo(-Math.PI / 4, 5)
  })
})
