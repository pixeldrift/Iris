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
  /** This node's own homing spring (default: the sim's). A held bubble uses a firm one so it tracks the finger. */
  homeK?: number
  /** Pushes others aside more than it is pushed (a bubble being carried). */
  heavy?: boolean
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

/** A "force field" around a group: bubbles that are not its own cannot come inside it. */
export interface Field {
  cx: number
  cy: number
  R: number
  /** The bubbles that belong to the group (they are free to be inside). */
  ids: Set<string>
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
  fields: Field[] = [],
): { bumps: Bump[]; energy: number } {
  const bumps: Bump[] = []
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    if (a.pinned) continue
    const k = a.homeK ?? p.home
    a.vx += (a.hx - a.x) * k * dt
    a.vy += (a.hy - a.y) * k * dt
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
        // a carried bubble mostly shoves the others; they only deflect it a little
        const aw = a.pinned ? 0 : b.pinned ? 1 : a.heavy ? 0.25 : b.heavy ? 0.75 : 0.5
        const bw = b.pinned ? 0 : a.pinned ? 1 : b.heavy ? 0.25 : a.heavy ? 0.75 : 0.5
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
  }

  // Hard limits, after the soft pushing above: a group's field keeps other groups' bubbles out, and no two bubbles may overlap (even
  // in the same group). A bubble that is held (pinned) is not moved, so it can be carried across a field to be dropped into a group.
  for (const f of fields) {
    for (const a of nodes) {
      if (a.pinned || f.ids.has(a.id)) continue
      const dx = a.x - f.cx
      const dy = a.y - f.cy
      const d = Math.hypot(dx, dy) || 0.001
      const lim = f.R + a.r + 4
      if (d < lim) {
        const ux = dx / d
        const uy = dy / d
        a.x += ux * (lim - d)
        a.y += uy * (lim - d)
        const inward = a.vx * ux + a.vy * uy
        if (inward < 0) {
          a.vx -= ux * inward
          a.vy -= uy * inward
        }
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        if (a.pinned && b.pinned) continue
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        const min = a.r + b.r + 2
        if (dist >= min) continue
        if (dist < 0.001) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          dist = Math.hypot(dx, dy) || 1
        }
        const nx = dx / dist
        const ny = dy / dist
        const wa = a.pinned ? 0 : b.pinned ? 1 : a.heavy ? 0.25 : b.heavy ? 0.75 : 0.5
        const wb = 1 - wa
        const over = min - dist
        a.x -= nx * over * wa
        a.y -= ny * over * wa
        b.x += nx * over * wb
        b.y += ny * over * wb
        // they stop closing in on each other (no springing back into the overlap)
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
        if (closing > 0) {
          a.vx -= nx * closing * wa
          a.vy -= ny * closing * wa
          b.vx += nx * closing * wb
          b.vy += ny * closing * wb
        }
      }
    }
  }
  // (counted after the hard limits, so a bubble just pressing against another, which the limits keep still, does not keep the water awake)
  for (const a of nodes) if (!a.pinned) energy += a.vx * a.vx + a.vy * a.vy
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
export function fitView(b: { minX: number; minY: number; maxX: number; maxY: number }, w: number, h: number, pad = 48, inset: { t?: number; r?: number; b?: number; l?: number } = {}) {
  // the zoom at which the bubbles just fill the width or the height (whichever is tighter), leaving `pad` all round, inside
  // the part of the viewport that is free (`inset` keeps clear of buttons and panels laid over its edges)
  const t = inset.t ?? 0
  const r = inset.r ?? 0
  const bo = inset.b ?? 0
  const l = inset.l ?? 0
  const bw = Math.max(1, b.maxX - b.minX)
  const bh = Math.max(1, b.maxY - b.minY)
  const aw = w - l - r
  const ah = h - t - bo
  const scale = Math.min(3, Math.max(0.2, Math.min((aw - pad * 2) / bw, (ah - pad * 2) / bh)))
  return {
    scale,
    tx: l + aw / 2 - ((b.minX + b.maxX) / 2) * scale,
    ty: t + ah / 2 - ((b.minY + b.maxY) / 2) * scale,
  }
}
