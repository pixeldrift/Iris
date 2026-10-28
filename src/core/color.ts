/** A folder (or person) color is a hue 0-360, or GRAY for the one neutral choice. */
export const GRAY = -1

/** An hsl()/hsla() string for a hue. Gray has no saturation, whatever saturation is asked for. */
export function tint(hue: number, s: number, l: number, a?: number): string {
  const sat = hue < 0 ? 0 : s
  const h = hue < 0 ? 0 : hue
  return a === undefined ? `hsl(${h},${sat}%,${l}%)` : `hsla(${h},${sat}%,${l}%,${a})`
}

/** 0 for gray, 1 otherwise: lets CSS (the .pad bubble gradients) scale saturation. */
export const satOf = (hue: number) => (hue < 0 ? 0 : 1)
