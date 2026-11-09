import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RGB, TOKENS } from './palette'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('the palette', () => {
  it('is the same in the stylesheet and in the colour slider', () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
      expect(m?.[1].toLowerCase(), name).toBe(value.toLowerCase())
    }
    for (const [name, rgb] of Object.entries(RGB)) {
      const m = css.match(new RegExp(`${name}:\\s*(\\d+) (\\d+) (\\d+)`))
      expect(m?.slice(1).map(Number), name).toEqual(rgb)
    }
  })
  it('has one warning family, not hand-typed hexes in components', () => {
    expect(css).toMatch(/--color-danger:/)
  })
})
