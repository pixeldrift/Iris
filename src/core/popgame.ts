/** The pop game, Simon style: bubbles light up in a colour order and you pop that order back. */

/** The colours in play: the most common hues among the bubbles, at most `max`. */
export function paletteOf(hues: number[], max = 5): number[] {
  const n = new Map<number, number>()
  for (const h of hues) n.set(h, (n.get(h) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, max).map(([h]) => h)
}

/** How long each light stays on and how fast the pattern runs: quicker every round, down to a floor. */
export const stepMs = (round: number): number => Math.max(260, 760 - (round - 1) * 45)

/** Points for popping one right, for finishing a round (more the longer the pattern), and a bonus for doing it quickly. */
export const POP_POINTS = 10
export const roundPoints = (round: number, tookMs: number, memory: boolean): number => {
  const quick = tookMs < round * stepMs(round) * 2 ? round * 5 : 0
  return (round * 10 + quick) * (memory ? 2 : 1)
}

export const randomColour = (n: number, prev?: number): number => {
  if (n <= 1) return 0
  let c = Math.floor(Math.random() * n)
  if (c === prev) c = (c + 1 + Math.floor(Math.random() * (n - 1))) % n
  return c
}
