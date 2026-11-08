// Pointers to what is off screen, for a canvas you pan and zoom: pure, so it is easy to test (and to port).

export interface EdgePoint {
  id: string
  /** Where it is on the canvas, and how big. */
  x: number
  y: number
  r: number
  hue: number
}

export interface EdgeMarker {
  /** Where the marker sits on the screen (just inside the border). */
  x: number
  y: number
  /** The way to go, in degrees (0 = right, 90 = down). */
  angle: number
  /** How many items lie that way (nearby ones share one marker). */
  count: number
  ids: string[]
  /** The nearest of them (on the canvas) and how far it is on screen: nearer ones read stronger. */
  nearest: { id: string; x: number; y: number }
  distance: number
  hue: number
}

/** Position along the border of the rectangle inset by `m`, going round clockwise from the top-left corner. */
function along(px: number, py: number, W: number, H: number, m: number): number {
  const w = W - 2 * m
  const h = H - 2 * m
  const x = px - m
  const y = py - m
  if (y <= 0.5) return x // top edge
  if (x >= w - 0.5) return w + y // right edge
  if (y >= h - 0.5) return w + h + (w - x) // bottom edge
  return 2 * w + h + (h - y) // left edge
}
function pointAt(s: number, W: number, H: number, m: number): { x: number; y: number } {
  const w = W - 2 * m
  const h = H - 2 * m
  const p = ((s % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h))
  if (p <= w) return { x: m + p, y: m }
  if (p <= w + h) return { x: m + w, y: m + (p - w) }
  if (p <= 2 * w + h) return { x: m + w - (p - w - h), y: m + h }
  return { x: m, y: m + h - (p - 2 * w - h) }
}

/**
 * The items outside the screen, each pointed to from the border: a ray from the middle of the screen through the item meets
 * the border where its marker goes. Those close together along the border share one marker with a count.
 */
export function edgeMarkers(points: EdgePoint[], view: { scale: number; tx: number; ty: number }, W: number, H: number, opts: { inset?: number; merge?: number; max?: number } = {}): EdgeMarker[] {
  const m = opts.inset ?? 16
  const merge = opts.merge ?? 44
  const max = opts.max ?? 24
  if (W <= 2 * m + 10 || H <= 2 * m + 10) return []
  const cx = W / 2
  const cy = H / 2
  const hits: { p: EdgePoint; s: number; d: number; angle: number }[] = []
  for (const p of points) {
    const sx = p.x * view.scale + view.tx
    const sy = p.y * view.scale + view.ty
    const slack = p.r * view.scale * 0.5
    if (sx >= -slack && sx <= W + slack && sy >= -slack && sy <= H + slack) continue // (on screen, or mostly)
    const dx = sx - cx
    const dy = sy - cy
    const k = Math.min(dx ? (W / 2 - m) / Math.abs(dx) : Infinity, dy ? (H / 2 - m) / Math.abs(dy) : Infinity)
    const edge = { x: cx + dx * k, y: cy + dy * k }
    hits.push({ p, s: along(edge.x, edge.y, W, H, m), d: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI })
  }
  hits.sort((a, b) => a.s - b.s)
  // group neighbours along the border
  const groups: (typeof hits)[] = []
  for (const h of hits) {
    const last = groups[groups.length - 1]
    if (last && h.s - last[last.length - 1].s <= merge) last.push(h)
    else groups.push([h])
  }
  const out: EdgeMarker[] = groups.map((g) => {
    const s = g.reduce((a, b) => a + b.s, 0) / g.length
    const pos = pointAt(s, W, H, m)
    const near = g.reduce((a, b) => (b.d < a.d ? b : a))
    return {
      x: pos.x,
      y: pos.y,
      angle: (Math.atan2(pos.y - cy, pos.x - cx) * 180) / Math.PI,
      count: g.length,
      ids: g.map((x) => x.p.id),
      nearest: { id: near.p.id, x: near.p.x, y: near.p.y },
      distance: near.d,
      hue: near.p.hue,
    }
  })
  return out.sort((a, b) => b.count - a.count || a.distance - b.distance).slice(0, max)
}
