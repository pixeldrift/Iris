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

/** A colour to start with: one there is a bubble for (null when the field is empty). */
export function firstColour(counts: number[]): number | null {
  const have = counts.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0)
  return have.length ? have[Math.floor(Math.random() * have.length)] : null
}

/**
 * Between rounds: the next colour for the pattern, and the colours of the new bubbles that replace the ones just popped.
 * `counts` is how many bubbles of each colour are left after the popping. A pattern may only ask for a colour as many
 * times as there are bubbles of it, so the next colour is the one that needs the fewest new bubbles, and the new bubbles
 * go first to any colour still short, then are random up to as many as were popped.
 */
export function planRound(seq: number[], counts: number[], popped: number): { next: number; add: number[] } {
  const need = (s: number[]) => counts.map((_, c) => s.filter((x) => x === c).length)
  const short = (s: number[]) => need(s).map((n, c) => Math.max(0, n - counts[c]))
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const last = seq[seq.length - 1]
  // fewest bubbles short, then a different colour from the last, then any
  const options = counts.map((_, c) => c).sort((a, b) => sum(short([...seq, a])) - sum(short([...seq, b])) || Number(a === last) - Number(b === last) || a - b)
  const best = sum(short([...seq, options[0]]))
  const ties = options.filter((c) => sum(short([...seq, c])) === best)
  const preferred = ties.filter((c) => c !== last)
  const pool = preferred.length ? preferred : ties
  const next = pool[Math.floor(Math.random() * pool.length)]
  const add: number[] = []
  short([...seq, next]).forEach((n, c) => {
    for (let i = 0; i < n; i++) add.push(c)
  })
  while (add.length < popped) add.push(Math.floor(Math.random() * counts.length))
  return { next, add }
}
