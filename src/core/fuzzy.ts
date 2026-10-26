// Small typo-tolerant matcher for tag autocomplete.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * Score 0..1 of how well `query` matches `target` (1 = identical).
 * Handles prefixes, substrings, subsequences ("eng" -> "English 101") and typos
 * ("engilsh" -> "English").
 */
export function fuzzyScore(query: string, target: string): number {
  const q = norm(query)
  const t = norm(target)
  if (!q) return 0
  if (q === t) return 1
  if (t.startsWith(q)) return 0.92 - Math.min(0.15, (t.length - q.length) * 0.01)
  if (t.includes(q)) return 0.8
  // any word in the target starts with the query
  if (t.split(/[\s/_-]+/).some((w) => w.startsWith(q))) return 0.78

  let best = 0
  // typo tolerance against the whole name and each word
  const candidates = [t, ...t.split(/[\s/_-]+/)]
  for (const c of candidates) {
    const slice = c.length > q.length ? c.slice(0, q.length + 1) : c
    for (const piece of [c, slice]) {
      const dist = levenshtein(q, piece)
      const maxLen = Math.max(q.length, piece.length)
      const sim = 1 - dist / maxLen
      const allowed = q.length <= 3 ? 0 : q.length <= 5 ? 1 : 2
      if (dist <= allowed) best = Math.max(best, 0.5 + sim * 0.3)
    }
  }
  // subsequence match
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  if (qi === q.length && q.length >= 2) best = Math.max(best, 0.4 + (q.length / t.length) * 0.2)
  return best
}

export function fuzzyRank<T>(query: string, items: T[], text: (t: T) => string, min = 0.4): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}

export const sameName = (a: string, b: string) => norm(a) === norm(b)
