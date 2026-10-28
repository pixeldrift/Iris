// Tiny soft-body simulation for the pond. Pure maths so it ports to Swift
// (CADisplayLink / SpriteKit) unchanged.

export interface SimNode {
  id: string
  /** Current position and velocity in world pixels. */
  x: number
  y: number
  vx: number
  vy: number
  /** Where the node "wants" to be (saved position or its cluster center). */
  hx: number
  hy: number
  r: number
  /** Excluded from the sim while the user holds it. */
  pinned: boolean
}

export interface SimParams {
  /** Spring pulling nodes home. */
  home: number
  /** Attraction between related pairs (0 disables). */
  magnet: number
  /** Share of speed kept each step (0..1). Lower = thicker water: motion dies away instead of rebounding. */
  damping: number
  /** How firmly overlapping nodes are pushed apart (default 0.12). */
  push?: number
}

/**
 * How the pond's water feels. At home = 0.012 a damping of 0.88 leaves a spring about half
 * damped (it overshoots and wobbles); around 0.78 is critically damped (it eases in with no
 * bounce at all). Free-mode bubbles are overdamped on purpose: slow and syrupy.
 */
export const WATER_FEEL = {
  /** Gathered clusters (a stronger spring): about critical damping, so they ease in without rebounding. */
  damping: 0.79,
  /** Free bubbles (a very weak spring): overdamped, but not so much that they crawl. */
  dampingFree: 0.865,
  homeFree: 0.002,
  homeGrouped: 0.011,
  magnet: 0.06,
  push: 0.085,
}

export interface Bump {
  id: string
  strength: number
}

/**
 * One step of the sim. `related(a, b)` says whether two nodes should lean
 * towards each other. Returns collisions hard enough to be worth a jiggle,
 * and the total kinetic energy so the caller can go to sleep.
 */
export function stepSim(
  nodes: SimNode[],
  p: SimParams,
  related: (a: string, b: string) => boolean,
  dt = 1,
): { bumps: Bump[]; energy: number } {
  const bumps: Bump[] = []
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    if (a.pinned) continue
    a.vx += (a.hx - a.x) * p.home * dt
    a.vy += (a.hy - a.y) * p.home * dt
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let dist = Math.hypot(dx, dy)
      if (dist < 0.001) {
        dx = Math.random() - 0.5
        dy = Math.random() - 0.5
        dist = Math.hypot(dx, dy)
      }
      const nx = dx / dist
      const ny = dy / dist
      const min = a.r + b.r + 6

      if (p.magnet > 0 && related(a.id, b.id) && dist > min + 4 && dist < 520) {
        // lean in until just touching; stronger when closer, so clusters tighten
        const pull = p.magnet * Math.min(1, 220 / dist) * dt
        if (!a.pinned) {
          a.vx += nx * pull
          a.vy += ny * pull
        }
        if (!b.pinned) {
          b.vx -= nx * pull
          b.vy -= ny * pull
        }
      }

      if (dist < min) {
        const overlap = min - dist
        const push = overlap * (p.push ?? 0.12) * dt
        const aw = a.pinned ? 0 : b.pinned ? 1 : 0.5
        const bw = b.pinned ? 0 : a.pinned ? 1 : 0.5
        a.vx -= nx * push * aw * 2
        a.vy -= ny * push * aw * 2
        b.vx += nx * push * bw * 2
        b.vy += ny * push * bw * 2
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
        if (closing > 0.9) {
          bumps.push({ id: a.id, strength: closing })
          bumps.push({ id: b.id, strength: closing })
        }
      }
    }
  }

  let energy = 0
  for (const a of nodes) {
    if (a.pinned) {
      a.vx = a.vy = 0
      continue
    }
    a.vx *= p.damping
    a.vy *= p.damping
    a.x += a.vx * dt
    a.y += a.vy * dt
    energy += a.vx * a.vx + a.vy * a.vy
  }
  return { bumps, energy }
}

/** Bounds of the nodes (including radii) in world px. */
export function boundsOf(nodes: { x: number; y: number; r: number }[]) {
  if (!nodes.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r)
    minY = Math.min(minY, n.y - n.r)
    maxX = Math.max(maxX, n.x + n.r)
    maxY = Math.max(maxY, n.y + n.r)
  }
  return { minX, minY, maxX, maxY }
}

/** View transform that fits `b` inside a w×h viewport with padding. */
export function fitView(b: { minX: number; minY: number; maxX: number; maxY: number }, w: number, h: number, pad = 48) {
  const bw = Math.max(1, b.maxX - b.minX)
  const bh = Math.max(1, b.maxY - b.minY)
  const scale = Math.min(2, Math.max(0.25, Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)))
  return {
    scale,
    tx: w / 2 - ((b.minX + b.maxX) / 2) * scale,
    ty: h / 2 - ((b.minY + b.maxY) / 2) * scale,
  }
}
