import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { orientationToQuaternion, TouchTracking } from './tracking'

const forward = (q: ReturnType<typeof orientationToQuaternion>) => new Vector3(0, 0, -1).applyQuaternion(q)

describe('tracking maths', () => {
  it('a phone held upright looks straight ahead (-Z); laid flat it looks down', () => {
    const upright = forward(orientationToQuaternion(0, 90, 0, 0))
    expect(upright.x).toBeCloseTo(0, 5)
    expect(upright.y).toBeCloseTo(0, 5)
    expect(upright.z).toBeCloseTo(-1, 5)
    const flat = forward(orientationToQuaternion(0, 0, 0, 0))
    expect(flat.y).toBeCloseTo(-1, 5)
  })
  it('turning the phone to the left (alpha up) turns the view left', () => {
    expect(forward(orientationToQuaternion(90, 90, 0, 0)).x).toBeLessThan(-0.99)
    expect(forward(orientationToQuaternion(270, 90, 0, 0)).x).toBeGreaterThan(0.99)
  })
  it('turning the screen (landscape) only rolls the picture: where the camera points does not change', () => {
    const portrait = forward(orientationToQuaternion(0, 0, -90, 0))
    const landscape = forward(orientationToQuaternion(0, 0, -90, 90))
    expect(landscape.x).toBeCloseTo(portrait.x, 5)
    expect(landscape.y).toBeCloseTo(portrait.y, 5)
    expect(landscape.z).toBeCloseTo(portrait.z, 5)
  })
  it('touch looking is clamped so it cannot flip over the top', () => {
    const t = new TouchTracking()
    t.look(0.5, 5)
    expect(t.pitch).toBeLessThan(1.4)
    t.reset()
    expect(t.yaw + t.pitch).toBe(0)
  })
})

describe('the motion sensor reading', () => {
  it('holds perfectly still when the phone is held still (no creeping turn), even with a compass heading present', async () => {
    const { SensorTracking } = await import('./tracking')
    const s = new SensorTracking()
    const e = { alpha: 123, beta: 85, gamma: 3, webkitCompassHeading: 200, webkitCompassAccuracy: 10 } as never
    s.ingest(e)
    const first = s.read().clone()
    for (let i = 0; i < 1200; i++) {
      s.ingest(e)
      s.read()
    }
    const last = s.read()
    expect(first.angleTo(last)).toBeLessThan(1e-3)
  })
  it('follows a real turn and settles on it, and Recenter makes the current heading ahead', async () => {
    const { SensorTracking } = await import('./tracking')
    const s = new SensorTracking()
    s.ingest({ alpha: 10, beta: 90, gamma: 0 })
    s.read()
    s.ingest({ alpha: 70, beta: 90, gamma: 0 }) // turned 60 degrees left
    let q = s.read()
    for (let i = 0; i < 200; i++) q = s.read()
    const f = new Vector3(0, 0, -1).applyQuaternion(q)
    expect(Math.atan2(-f.x, -f.z) * (180 / Math.PI)).toBeGreaterThan(55)
    s.recenter()
    for (let i = 0; i < 5; i++) s.read()
    const g = new Vector3(0, 0, -1).applyQuaternion(s.read())
    expect(g.z).toBeLessThan(-0.99)
  })
  it('does not jitter on tiny sensor noise', async () => {
    const { SensorTracking } = await import('./tracking')
    const s = new SensorTracking()
    s.ingest({ alpha: 50, beta: 90, gamma: 0 })
    s.read()
    let maxStep = 0
    let prev = s.read().clone()
    for (let i = 0; i < 300; i++) {
      s.ingest({ alpha: 50 + (Math.random() - 0.5) * 0.4, beta: 90 + (Math.random() - 0.5) * 0.4, gamma: (Math.random() - 0.5) * 0.4 })
      const q = s.read().clone()
      maxStep = Math.max(maxStep, prev.angleTo(q))
      prev = q
    }
    expect(maxStep).toBeLessThan(0.01) // (under about half a degree a frame)
  })
})
