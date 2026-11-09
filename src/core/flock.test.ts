import { describe, expect, it } from 'vitest'
import { stepSim, type SimNode } from './flock'

const node = (id: string, x: number, y: number, r = 30, hx = x, hy = y): SimNode => ({ id, x, y, vx: 0, vy: 0, hx, hy, r, pinned: false })
const P = { home: 0.011, magnet: 0, damping: 0.79, push: 0.085 }
const gap = (a: SimNode, b: SimNode) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r

describe('the pond water', () => {
  it('never leaves two bubbles overlapping, even when their homes are on top of each other', () => {
    const a = node('a', 100, 100, 40, 100, 100)
    const b = node('b', 105, 100, 40, 100, 100) // wants the very same place
    for (let i = 0; i < 120; i++) stepSim([a, b], P, () => false)
    expect(gap(a, b)).toBeGreaterThanOrEqual(0)
  })

  it('keeps a crowd apart: every pair has room after settling', () => {
    const ns = Array.from({ length: 14 }, (_, i) => node(`n${i}`, 200 + (i % 4) * 20, 200 + Math.floor(i / 4) * 20, 24 + (i % 3) * 8, 200, 200))
    for (let i = 0; i < 200; i++) stepSim(ns, P, () => false)
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(gap(ns[i], ns[j])).toBeGreaterThanOrEqual(-0.5)
  })

  it('a group’s field keeps other groups’ bubbles out, and lets its own in', () => {
    const own = node('own', 0, 0, 20)
    const stranger = node('stranger', 10, 0, 20, 10, 0) // wanders into the field
    const field = { pad: 22, ids: new Set(['own']) }
    for (let i = 0; i < 60; i++) stepSim([own, stranger], P, () => false, 1, [field])
    expect(Math.hypot(stranger.x - own.x, stranger.y - own.y)).toBeGreaterThanOrEqual(own.r + 22 + stranger.r - 0.5)
  })

  it('a bubble being carried can cross a field (to be dropped into the group)', () => {
    const held = node('held', 0, 0, 20)
    held.pinned = true
    const member = node('member', 5, 0, 20)
    const field = { pad: 22, ids: new Set(['member']) }
    stepSim([held, member], P, () => false, 1, [field])
    expect(held.x).toBe(0)
    expect(held.y).toBe(0)
  })
})

describe('a group name is a soft nudge, not a wall', () => {
  const name = (): SimNode => ({ id: 'label:g:0', x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, r: 20, pinned: true, owner: 'g', pad: 10, soft: 0.3 })

  it('lets a bubble on its way home pass over it', () => {
    const b: SimNode = { ...node('b', -100, 0, 24, 100, 0), group: 'other' } // home is the far side of the name
    const n = name()
    for (let i = 0; i < 600; i++) stepSim([b, n], P, () => false)
    expect(Math.abs(b.x - 100)).toBeLessThan(15) // it got through
  })

  it('eases a bubble off it rather than leaving it sitting there, a little further for another group\u2019s than its own', () => {
    // both homes are right at the name's edge (a hair inside the room each would keep)
    const own: SimNode = { ...node('own', 0, 60, 24, 0, 46), group: 'g' }
    const stranger: SimNode = { ...node('stranger', 0, -60, 24, 0, -46), group: 'other' }
    const n = name()
    for (let i = 0; i < 600; i++) stepSim([own, stranger, n], P, () => false)
    const gapOf = (b: SimNode) => Math.hypot(b.x - n.x, b.y - n.y) - b.r - n.r
    expect(gapOf(own)).toBeGreaterThan(-3) // eased off, not resting on it
    expect(gapOf(stranger)).toBeGreaterThan(gapOf(own) + 3) // and the stranger is held further off
  })
})
