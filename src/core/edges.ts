// Pointers to what is off screen, for a canvas you pan and zoom: pure, so it is easy to test (and to port).

export interface EdgePoint {
  id: string
  /** Where it is on the canvas, and how big. */
  x: number
  y: number
  r: number
  hue: number
}

export interface EdgeDot {
  id: string
  /** Where the dot sits on the screen: where a line from the middle of the screen to the item crosses the frame. */
  x: number
  y: number
  hue: number
  /** How far the item is from the middle of the screen, in screen pixels. */
  distance: number
  /** The item's place on the canvas (for going there). */
  at: { x: number; y: number }
}

/**
 * One dot for each item that is wholly outside the screen (one even partly in view gets none), placed where a straight line from
 * the middle of the screen to the item meets the frame (inset by `inset` so the dot is not cut off). As the canvas moves, the dots ride
 * along the border.
 */
export function edgeDots(points: EdgePoint[], view: { scale: number; tx: number; ty: number }, W: number, H: number, opts: { inset?: number; max?: number } = {}): EdgeDot[] {
  const m = opts.inset ?? 9
  const max = opts.max ?? 80
  if (W <= 2 * m + 10 || H <= 2 * m + 10) return []
  const cx = W / 2
  const cy = H / 2
  const out: EdgeDot[] = []
  for (const p of points) {
    const sx = p.x * view.scale + view.tx
    const sy = p.y * view.scale + view.ty
    const r = p.r * view.scale
    // wholly outside: clear of the screen on at least one side
    const outside = sx + r <= 0 || sx - r >= W || sy + r <= 0 || sy - r >= H
    if (!outside) continue
    const dx = sx - cx
    const dy = sy - cy
    const k = Math.min(dx ? (W / 2 - m) / Math.abs(dx) : Infinity, dy ? (H / 2 - m) / Math.abs(dy) : Infinity)
    out.push({ id: p.id, x: cx + dx * k, y: cy + dy * k, hue: p.hue, distance: Math.hypot(dx, dy), at: { x: p.x, y: p.y } })
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, max)
}
