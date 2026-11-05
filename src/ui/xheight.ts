const cache = new Map<string, number>()

/**
 * How far (px, negative = up) to move a line of text inside a box `line` px tall so that the body of its letters (the x-height,
 * not the line box, which sits text a little low) is centred. Measured from the real font with a canvas, so it holds on any device's font.
 */
export function xHeightShift(el: HTMLElement, line: number): number {
  const cs = getComputedStyle(el)
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  const key = `${font}/${line}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let shift = 0
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.font = font
      const m = ctx.measureText('x')
      ctx.font = font.replace(/[\d.]+px/, '200px')
      const xRatio = ctx.measureText('x').actualBoundingBoxAscent / 200 // (measured large: at the real size the answer is rounded to whole pixels)
      const xh = xRatio * parseFloat(cs.fontSize)
      const asc = Math.round(m.fontBoundingBoxAscent) // (layout rounds the font's ascent and descent to whole pixels)
      const desc = Math.round(m.fontBoundingBoxDescent)
      if (Number.isFinite(asc) && Number.isFinite(desc) && xh > 0) {
        const baseline = Math.round((line - (asc + desc)) / 2 + asc) // where the baseline falls in a line box centred on its content area (snapped to a pixel)
        shift = line / 2 - (baseline - xh / 2)
      }
    }
  } catch {
    /* no canvas: leave it where the browser puts it */
  }
  cache.set(key, shift)
  return shift
}
