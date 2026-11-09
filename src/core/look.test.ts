import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOOK, look } from './look'

describe('the item look', () => {
  it('at the middle urgency is the original pastel, deeper when urgent, softer when relaxed', () => {
    const mid = look(285, 0.5)
    expect(mid.fill.s).toBeCloseTo(70)
    expect(mid.fill.l).toBeCloseTo(85)
    expect(mid.fill.a).toBeCloseTo(0.65)
    expect(mid.outline).toEqual({ s: 62, l: 64, a: 0.85 })
    expect(look(285, 1).fill.a).toBeGreaterThan(mid.fill.a)
    expect(look(285, 0).fill.l).toBeGreaterThan(mid.fill.l)
  })
  it('grey has no saturation anywhere', () => {
    const g = look(-1, 0.8)
    expect([g.fill.s, g.outline.s, g.shadow.s]).toEqual([0, 0, 0])
  })
  it('is the same as the stylesheet draws', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    const block = css.slice(css.indexOf('.pad,\n.tint {'), css.indexOf('.tint:hover'))
    expect(block).toContain('calc(70% * var(--s, 1) * (0.55 + 0.9 * var(--u, 0.5)))')
    expect(block).toContain('calc(95% - 20% * var(--u, 0.5))')
    expect(block).toContain('calc(0.35 + 0.6 * var(--u, 0.5))')
    expect(block).toContain('border: 1px solid hsla(var(--th), calc(62% * var(--s, 1)), 64%, 0.85)')
    expect(block).toContain('text-shadow: 0 0 3px rgba(255, 255, 255, 0.95)')
    expect(block).toContain(`0 ${LOOK.drop.y}px ${LOOK.drop.blur}px ${LOOK.drop.spread}px hsla(var(--th), calc(45% * var(--s, 1) * (0.55 + 0.9 * var(--u, 0.5))), calc(62% - 28% * var(--u, 0.5)), calc(0.16 + 0.44 * var(--u, 0.5)))`)
    expect(block).toContain(`rgba(255, 255, 255, ${LOOK.baseAlpha})`)
    expect(block).toContain('ellipse at 70% 25%')
    expect(css).toContain('.tint { --glow-rx: 24rem; }')
    expect(block).toContain('ellipse var(--glow-rx, 99%) 113% at 30% 80%')
  })
})
