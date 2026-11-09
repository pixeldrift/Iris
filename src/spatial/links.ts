import { Vector3 } from 'three'
import { planeBasis } from './layout'
import { K, WORLD, type ClusterPlacement } from './types'

export interface LinkGroup {
  id: string
  parent: string | null
  hue: number
  collapsed?: boolean
}

/**
 * The connectors of the group tree as triangle data: a slim, even ribbon with round ends that leaves the bottom of a group (or its name,
 * when folded), swings in a gentle S, and arrives at the top of its subgroup, shading from one colour to the other. A branch always runs
 * downhill. The ribbon faces the viewer (the origin). Pure, so it can be tested without a renderer.
 */
export function linkGeometry(clusters: readonly LinkGroup[], shown: Record<string, ClusterPlacement>): { pos: number[]; col: number[]; idx: number[] } | null {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const SEG = 48
  const colorOf = (hue: number): [number, number, number] => {
    const h = (hue < 0 ? 0 : hue) / 360
    const sat = hue < 0 ? 0 : 0.55
    const l = 0.68
    const a = sat * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + h * 12) % 12
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return [f(0), f(8), f(4)]
  }
  const hueOf = new Map(clusters.map((c) => [c.id, c.hue]))
  const byId = new Map(clusters.map((c) => [c.id, c]))
  for (const h of clusters) {
    const cp = shown[h.id]
    const pp = h.parent ? shown[h.parent] : undefined
    if (!cp || !pp) continue
    const pb = planeBasis(pp)
    const cb = planeBasis(cp)
    const ps = pp.scale ?? 1
    const cs = cp.scale ?? 1
    // from just under the group's box (or its name, when folded) to just above the subgroup's name
    const prow = pp.rows ?? 1
    const pc = byId.get(h.parent ?? '')
    const below = pc?.collapsed ? 0.45 * K : prow * (WORLD.cardH + WORLD.gap) + 0.5 * K
    const at = (c: ClusterPlacement, b: ReturnType<typeof planeBasis>, v: number) => new Vector3(c.x + b.up[0] * v, c.y + b.up[1] * v, c.z + b.up[2] * v)
    const p0 = at(pp, pb, -below * ps)
    const p3 = at(cp, cb, 0.34 * K * cs)
    // a branch always runs downhill: if the subgroup's name is not clearly lower than where this one leaves, it leaves from higher up
    const drop = (p0.y - p3.y) / Math.max(0.2, pb.up[1])
    if (drop < 0.5 * K * ps) p0.addScaledVector(new Vector3(pb.up[0], pb.up[1], pb.up[2]), (0.5 * K * ps - drop) * Math.max(0.2, pb.up[1]))
    const d = p0.distanceTo(p3)
    // a gentle S: it leaves heading down, arrives heading down, with a sideways sway so it reads as grown, not ruled
    const side = new Vector3(pb.right[0], pb.right[1], pb.right[2]).multiplyScalar(((cp.a - pp.a) * pp.r) * 0.18)
    const down = new Vector3(-pb.up[0], -pb.up[1], -pb.up[2]).multiplyScalar(d * 0.45)
    const p1 = p0.clone().add(down).add(side)
    const p2 = p3.clone().sub(down).sub(side)
    const c0 = colorOf(hueOf.get(h.parent as string) ?? 285)
    const c1 = colorOf(h.hue)
    const base = pos.length / 3
    const pts: Vector3[] = []
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG
      const u = 1 - t
      pts.push(p0.clone().multiplyScalar(u * u * u).add(p1.clone().multiplyScalar(3 * u * u * t)).add(p2.clone().multiplyScalar(3 * u * t * t)).add(p3.clone().multiplyScalar(t * t * t)))
    }
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG
      const tan = (pts[Math.min(SEG, i + 1)].clone().sub(pts[Math.max(0, i - 1)])).normalize()
      // a ribbon that faces the viewer (the origin): its width runs across the way the branch is going
      const toEye = pts[i].clone().negate().normalize()
      const across = new Vector3().crossVectors(tan, toEye).normalize()
      // an even, slim line with a round end (a half circle as wide as the line)
      const W = 0.055 * K
      const e = Math.min(0.2, W / (d * 1.1))
      const edge = Math.min(t, 1 - t)
      const w = edge >= e ? W : W * Math.sqrt(Math.max(0, 1 - ((e - edge) / e) ** 2))
      for (const sgn of [-1, 1]) {
        const q = pts[i].clone().addScaledVector(across, sgn * w)
        pos.push(q.x, q.y, q.z)
        col.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t)
      }
    }
    for (let i = 0; i < SEG; i++) {
      const a = base + i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  return pos.length ? { pos, col, idx } : null
}
