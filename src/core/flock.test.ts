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

describe('a group name keeps a wider berth from strangers', () => {
  it('its own bubbles may come closer to it than another group’s', () => {
    const name: SimNode = { id: 'label:g:0', x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, r: 20, pinned: true, owner: 'g', pad: 26 }
    // both want to sit right up against the name (their homes are at its edge)
    const own: SimNode = { ...node('own', 0, 60, 24, 0, 46), group: 'g' }
    const stranger: SimNode = { ...node('stranger', 0, -60, 24, 0, -46), group: 'other' }
    for (let i = 0; i < 300; i++) stepSim([own, stranger, name], P, () => false)
    const ownGap = Math.hypot(own.x - name.x, own.y - name.y) - own.r - name.r
    const strangerGap = Math.hypot(stranger.x - name.x, stranger.y - name.y) - stranger.r - name.r
    expect(ownGap).toBeGreaterThanOrEqual(0)
    expect(strangerGap).toBeGreaterThan(ownGap + 15) // the stranger is held clearly further off
  })
})
