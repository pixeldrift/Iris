import { useMemo, type CSSProperties } from 'react'
import { tint } from '../core/color'
import type { FlowerShape } from '../core/types'

/**
 * Folder flowers. The artwork lives in real SVG files, one per shape, in `src/assets/flowers/`:
 * open and edit them in any vector editor (see the README there). This file only loads them,
 * repeats the petals to the requested count, and applies a folder's colour.
 *
 * Each shape has its own silhouette (radial, cup, spike, bell…), not just a different petal
 * count or colour, so folders stay distinguishable at 18px and in greyscale. Shapes made of
 * repeated petals take a `petals` count, so the count could later carry meaning (e.g. priority)
 * without redrawing anything.
 */
export type { FlowerShape }

export const FLOWER_SHAPES: { id: FlowerShape; label: string; petals?: number }[] = [
  { id: 'blossom', label: 'Blossom', petals: 5 },
  { id: 'daisy', label: 'Daisy', petals: 12 },
  { id: 'rose', label: 'Rose' },
  { id: 'lily', label: 'Lily', petals: 6 },
  { id: 'iris', label: 'Iris' },
  { id: 'tulip', label: 'Tulip' },
  { id: 'poppy', label: 'Poppy' },
  { id: 'cosmos', label: 'Cosmos', petals: 8 },
  { id: 'pinwheel', label: 'Pinwheel', petals: 5 },
  { id: 'sunflower', label: 'Sunflower', petals: 14 },
  { id: 'hibiscus', label: 'Hibiscus' },
  { id: 'bell', label: 'Bluebell' },
]

const files = import.meta.glob('../assets/flowers/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SOURCE = new Map<string, string>(Object.entries(files).map(([path, text]) => [path.split('/').pop()!.replace('.svg', ''), text]))

const SVGNS = 'http://www.w3.org/2000/svg'
const cache = new Map<string, string>()

/** The inside of a flower's <svg>, with every `data-ring` repeated (variable rings to `petals`). */
function inner(shape: FlowerShape, petals?: number): string {
  const key = `${shape}:${petals ?? ''}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const text = SOURCE.get(shape)
  if (!text) return ''
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  for (const g of Array.from(root.querySelectorAll('g[data-ring]'))) {
    const id = g.getAttribute('data-ring')!
    const variable = g.hasAttribute('data-variable')
    const count = Math.max(3, Math.min(20, variable && petals ? petals : Number(g.getAttribute('data-count'))))
    const offsetAttr = g.getAttribute('data-offset')
    const offset = offsetAttr === 'half' ? 180 / count : Number(offsetAttr ?? 0)
    while (g.firstChild) g.removeChild(g.firstChild)
    for (let i = 0; i < count; i++) {
      const use = doc.createElementNS(SVGNS, 'use')
      use.setAttribute('href', `#${id}`)
      use.setAttribute('transform', `rotate(${Math.round((offset + (360 / count) * i) * 100) / 100})`)
      g.appendChild(use)
    }
  }
  root.querySelector('title')?.remove()
  const ser = new XMLSerializer()
  const html = Array.from(root.childNodes)
    .filter((n) => n.nodeType === 1)
    .map((n) => ser.serializeToString(n))
    .join('')
  cache.set(key, html)
  return html
}

const tones = (hue: number, mono: boolean): CSSProperties =>
  mono
    ? ({
        // one hue in four lightnesses: the shape reads, and nothing can clash with the chosen colour
        '--flower-base': `${tint(hue, 50, 58)}`,
        '--flower-light': `${tint(hue, 50, 72)}`,
        '--flower-deep': `${tint(hue, 50, 44)}`,
        '--flower-cream': `${tint(hue, 50, 84)}`,
      } as CSSProperties)
    : ({
    '--flower-base': `${tint(hue, 62, 74)}`,
    '--flower-light': `${tint(hue, 72, 87)}`,
    '--flower-deep': `${tint(hue, 48, 56)}`,
    '--flower-cream': '#fff6dc',
  }) as CSSProperties

export function Flower({
  hue,
  size = 18,
  shape = 'blossom',
  petals,
  mono = true,
  className = '',
}: {
  hue: number
  size?: number
  shape?: FlowerShape
  /** Only for shapes with variable rings (blossom, daisy, lily, cosmos, pinwheel, sunflower). */
  petals?: number
  /** Draw in a single colour (the folder's own), centres and all. Used in pickers. */
  mono?: boolean
  className?: string
}) {
  const html = useMemo(() => inner(shape, petals), [shape, petals])
  return <svg width={size} height={size} viewBox="-12 -12 24 24" className={className} style={tones(hue, mono)} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
}
