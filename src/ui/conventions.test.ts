import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx|ts)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
const root = new URL('..', import.meta.url).pathname
const sources = files(root).map((f) => ({ f: f.replace(root, 'src/'), s: readFileSync(f, 'utf8') }))

/** House rules from the code audit, kept as tests so they do not drift back. */
describe('conventions', () => {
  it('uses the danger tokens, not hand-typed warning colours', () => {
    const bad = sources.filter(({ s }) => /\[#(c4577e|c95b88|b04a6e|9a4566)\]/i.test(s)).map((x) => x.f)
    expect(bad).toEqual([])
  })
  it('uses the named stacking layers, not numbers, above 40', () => {
    const bad = sources.filter(({ s }) => /\bz-\[(5\d|[6-9]\d|\d{3})\]/.test(s) || /\bz-50\b/.test(s)).map((x) => x.f)
    expect(bad).toEqual([])
  })
  it('gives an icon button one hover label (a Tip), not a title that repeats its aria-label', () => {
    const dup: string[] = []
    for (const { f, s } of sources) {
      for (const m of s.matchAll(/<button\b[^<>]*>/g)) {
        const a = m[0].match(/aria-label="([^"]+)"/)
        const t = m[0].match(/\btitle="([^"]+)"/)
        if (a && t && a[1] === t[1]) dup.push(`${f}: ${a[1]}`)
      }
    }
    expect(dup).toEqual([])
  })
})
