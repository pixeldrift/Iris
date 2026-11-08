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
