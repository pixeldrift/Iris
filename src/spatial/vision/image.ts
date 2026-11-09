// Greyscale images and the few things done to them: a picture is read once per frame, shrunk, and looked at as a pyramid.

export interface Gray {
  w: number
  h: number
  d: Float32Array
}

/** Luminance from RGBA pixels (as a canvas gives them). */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, into?: Gray): Gray {
  const g = into && into.w === w && into.h === h ? into : { w, h, d: new Float32Array(w * h) }
  for (let i = 0, j = 0; i < w * h; i++, j += 4) g.d[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  return g
}

/** Half the size, each pixel the mean of four. */
export function halve(g: Gray): Gray {
  const w = Math.max(1, g.w >> 1)
  const h = Math.max(1, g.h >> 1)
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(g.w - 1, x * 2)
      const y0 = Math.min(g.h - 1, y * 2)
      const x1 = Math.min(g.w - 1, x0 + 1)
      const y1 = Math.min(g.h - 1, y0 + 1)
      d[y * w + x] = (g.d[y0 * g.w + x0] + g.d[y0 * g.w + x1] + g.d[y1 * g.w + x0] + g.d[y1 * g.w + x1]) / 4
    }
  return { w, h, d }
}

export function pyramid(g: Gray, levels: number): Gray[] {
  const out = [g]
  for (let i = 1; i < levels; i++) out.push(halve(out[i - 1]))
  return out
}

/** The value at a fractional position (bilinear; positions outside the picture read the nearest edge). */
export function at(g: Gray, x: number, y: number): number {
  const xc = Math.min(g.w - 1.001, Math.max(0, x))
  const yc = Math.min(g.h - 1.001, Math.max(0, y))
  const x0 = Math.floor(xc)
  const y0 = Math.floor(yc)
  const fx = xc - x0
  const fy = yc - y0
  const i = y0 * g.w + x0
  return (g.d[i] * (1 - fx) + g.d[i + 1] * fx) * (1 - fy) + (g.d[i + g.w] * (1 - fx) + g.d[i + g.w + 1] * fx) * fy
}
