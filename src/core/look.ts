/**
 * The look of an item, in numbers: the pond bubble's. The stylesheet (`.pad` / `.tint` in `index.css`) draws it with CSS variables;
 * the 3D cards are drawn on a canvas and cannot read CSS, so they read these. Both say the same thing, and `look.test.ts` checks the
 * stylesheet still contains these constants.
 *
 * `hue` is a folder's colour (negative = the grey group); `urgency` runs 0 to 1 (0.5 is the original pastel).
 */
export interface Look {
  /** The hue to draw with (0 for grey, which also has no saturation). */
  h: number
  /** The coloured glow in the lower right of the item. */
  fill: { s: number; l: number; a: number }
  /** The thin outline that keeps the colour however pale the inside is. */
  outline: { s: number; l: number; a: number }
  /** The soft shadow underneath. */
  shadow: { s: number; l: number; a: number }
}

export const LOOK = {
  /** The white base the colour sits on, and the shine in the upper left. */
  baseAlpha: 0.72,
  shine: { at: [0.3, 0.25] as const, alpha: 0.95, stop: 0.55 },
  glow: { at: [0.7, 0.8] as const, stop: 0.7 },
  border: 'rgba(255,255,255,0.85)',
  /** The glow around words, so dark text reads against the colour (blur px in the canvas cards, which are drawn about 3x CSS size). */
  textGlow: { color: 'rgba(255,255,255,0.95)', blur: 8 },
} as const

export function look(hue: number, urgency = 0.5): Look {
  const s = hue < 0 ? 0 : 1
  const u = Math.min(1, Math.max(0, urgency))
  const k = 0.55 + 0.9 * u
  return {
    h: hue < 0 ? 0 : hue,
    fill: { s: 70 * s * k, l: 95 - 20 * u, a: 0.35 + 0.6 * u },
    outline: { s: 62 * s, l: 64, a: 0.85 },
    shadow: { s: 45 * s * k, l: 62 - 28 * u, a: 0.12 + 0.46 * u },
  }
}

export const hsla = (h: number, s: number, l: number, a = 1) => `hsla(${Math.round(h)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a.toFixed(3)})`
