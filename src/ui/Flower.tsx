import type { ReactNode } from 'react'

/**
 * Folder flowers. Each shape has its own silhouette (radial, cup, spike, bell…), not just a
 * different petal count or colour, so folders stay distinguishable at 18px and in greyscale.
 * Shapes that are built from repeated petals take a `petals` count, so the count could later
 * carry meaning (e.g. priority) without redrawing anything.
 */
export type FlowerShape =
  | 'classic'
  | 'daisy'
  | 'rose'
  | 'lily'
  | 'iris'
  | 'tulip'
  | 'poppy'
  | 'cosmos'
  | 'pinwheel'
  | 'lavender'
  | 'sunflower'
  | 'hibiscus'
  | 'bell'

export const FLOWER_SHAPES: { id: FlowerShape; label: string; petals?: number }[] = [
  { id: 'classic', label: 'Blossom', petals: 5 },
  { id: 'daisy', label: 'Daisy', petals: 12 },
  { id: 'rose', label: 'Rose' },
  { id: 'lily', label: 'Lily', petals: 6 },
  { id: 'iris', label: 'Iris' },
  { id: 'tulip', label: 'Tulip' },
  { id: 'poppy', label: 'Poppy' },
  { id: 'cosmos', label: 'Cosmos', petals: 8 },
  { id: 'pinwheel', label: 'Pinwheel', petals: 5 },
  { id: 'lavender', label: 'Lavender' },
  { id: 'sunflower', label: 'Sunflower', petals: 14 },
  { id: 'hibiscus', label: 'Hibiscus' },
  { id: 'bell', label: 'Bluebell' },
]

const spin = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => offset + (360 / n) * i)

interface Tones {
  base: string
  light: string
  deep: string
  cream: string
}

const tones = (hue: number): Tones => ({
  base: `hsl(${hue},62%,74%)`,
  light: `hsl(${hue},72%,87%)`,
  deep: `hsl(${hue},48%,56%)`,
  cream: '#fff6dc',
})

type Draw = (t: Tones, petals: number) => ReactNode

const SHAPES: Record<FlowerShape, Draw> = {
  // five soft oval petals around a white eye: the original
  classic: (t, n) => (
    <>
      {spin(n).map((a) => (
        <ellipse key={a} cx="0" cy="-5.2" rx="3.6" ry="5.6" fill={t.base} transform={`rotate(${a})`} />
      ))}
      <circle r="2.3" fill="#fff" opacity=".92" />
    </>
  ),

  // many thin rays around a fat golden eye
  daisy: (t, n) => (
    <>
      {spin(n).map((a) => (
        <ellipse key={a} cx="0" cy="-6.7" rx="1.55" ry="4.8" fill={t.base} transform={`rotate(${a})`} />
      ))}
      <circle r="3.4" fill="#f8d86a" />
      <circle r="3.4" fill="none" stroke={t.light} strokeWidth=".7" />
    </>
  ),

  // layered round petals that tighten into a swirl
  rose: (t) => (
    <>
      {spin(5).map((a) => (
        <circle key={`o${a}`} cx="0" cy="-5.6" r="4.6" fill={t.light} stroke={t.base} strokeWidth=".5" transform={`rotate(${a})`} />
      ))}
      {spin(5, 36).map((a) => (
        <circle key={`m${a}`} cx="0" cy="-3.3" r="3.5" fill={t.base} stroke={t.light} strokeWidth=".4" transform={`rotate(${a})`} />
      ))}
      {spin(3, 10).map((a) => (
        <circle key={`i${a}`} cx="0" cy="-1.5" r="2.3" fill={t.deep} transform={`rotate(${a})`} />
      ))}
      <path d="M-1 0a1 1 0 1 1 2 0a2 2 0 1 1-4 0a3 3 0 1 1 6 0" fill="none" stroke="#fff" strokeWidth=".6" strokeLinecap="round" opacity=".8" />
    </>
  ),

  // six long pointed petals with a centre vein
  lily: (t, n) => (
    <>
      {spin(n).map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 0C2.8-3 3.4-7.2 0-11.4C-3.4-7.2-2.8-3 0 0Z" fill={t.base} />
          <path d="M0-1.2L0-8.6" stroke={t.deep} strokeWidth=".55" strokeLinecap="round" opacity=".7" />
        </g>
      ))}
      <circle r="1.5" fill={t.cream} />
    </>
  ),

  // three broad drooping falls with three narrow standards between them
  iris: (t) => (
    <>
      {spin(3, 0).map((a) => (
        <ellipse key={`s${a}`} cx="0" cy="-6" rx="2.1" ry="5.4" fill={t.deep} transform={`rotate(${a + 60})`} />
      ))}
      {spin(3, 0).map((a) => (
        <g key={`f${a}`} transform={`rotate(${a})`}>
          <ellipse cx="0" cy="-6.1" rx="4" ry="5.6" fill={t.base} />
          <path d="M0-2.2L0-7" stroke="#f8d86a" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      ))}
      <circle r="1.3" fill={t.cream} />
    </>
  ),

  // a cup (not radial): three overlapping petals and a stem
  tulip: (t) => (
    <>
      <path d="M0 3.5L0 11" stroke={t.deep} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M0 8c-3.5-.4-5-2-5.5-3.5 2.5.2 4.2 1.4 5.5 3.5Z" fill={t.deep} opacity=".8" />
      <path d="M-6.2-6.4C-8.2-.6-4.6 3.6 0 3.8C-2.7.2-3.6-3.6-6.2-6.4Z" fill={t.base} />
      <path d="M6.2-6.4C8.2-.6 4.6 3.6 0 3.8C2.7.2 3.6-3.6 6.2-6.4Z" fill={t.base} />
      <path d="M0-10C4-6.8 5.2-1.4 0 3.8C-5.2-1.4-4-6.8 0-10Z" fill={t.light} stroke={t.base} strokeWidth=".5" />
    </>
  ),

  // four big overlapping rounds around a dark heart
  poppy: (t) => (
    <>
      {spin(4, 45).map((a) => (
        <circle key={a} cx="0" cy="-4.6" r="5.5" fill={t.base} stroke={t.light} strokeWidth=".7" transform={`rotate(${a})`} />
      ))}
      <circle r="2.1" fill={`hsl(${0},0%,28%)`} opacity=".72" />
      {spin(8).map((a) => (
        <circle key={a} cx="0" cy="-3.2" r=".45" fill="#fff" opacity=".8" transform={`rotate(${a})`} />
      ))}
    </>
  ),

  // wide petals with two scalloped tips
  cosmos: (t, n) => (
    <>
      {spin(n).map((a) => (
        <path key={a} d="M0 0C-3.4-2.6-4.4-6.6-3.2-9.6Q-1.6-8.4 0-9.8Q1.6-8.4 3.2-9.6C4.4-6.6 3.4-2.6 0 0Z" fill={t.base} stroke={t.light} strokeWidth=".4" transform={`rotate(${a})`} />
      ))}
      <circle r="1.9" fill="#f8d86a" />
    </>
  ),

  // curved blades that make it look like it is spinning
  pinwheel: (t, n) => (
    <>
      {spin(n).map((a) => (
        <path key={a} d="M0 0C4.2-1.6 7.6-5.6 3.6-10.6C1.2-6.8 0-3.6 0 0Z" fill={t.base} transform={`rotate(${a})`} />
      ))}
      {spin(n).map((a) => (
        <path key={`l${a}`} d="M.6-1.2C2.6-3.4 3.6-6 2.6-8.4" fill="none" stroke={t.light} strokeWidth=".6" strokeLinecap="round" transform={`rotate(${a})`} />
      ))}
      <circle r="1.5" fill="#fff" opacity=".92" />
    </>
  ),

  // a vertical spike of small buds (not radial at all)
  lavender: (t) => (
    <>
      <path d="M0 11L0-2" stroke={t.deep} strokeWidth="1" strokeLinecap="round" opacity=".8" />
      {Array.from({ length: 7 }, (_, i) => {
        const y = 7.6 - i * 2.55
        const r = 2.3 - i * 0.18
        return (
          <g key={i}>
            <ellipse cx={-1.5 - (6 - i) * 0.05} cy={y} rx={r} ry={r * 0.72} fill={i % 2 ? t.base : t.light} transform={`rotate(-28 ${-1.5} ${y})`} />
            <ellipse cx={1.5 + (6 - i) * 0.05} cy={y - 0.9} rx={r} ry={r * 0.72} fill={i % 2 ? t.light : t.base} transform={`rotate(28 ${1.5} ${y - 0.9})`} />
          </g>
        )
      })}
      <ellipse cx="0" cy="-10.4" rx="1.3" ry="1.8" fill={t.deep} />
    </>
  ),

  // a ring of short pointed rays around a big dark seed head
  sunflower: (t, n) => (
    <>
      {spin(n).map((a) => (
        <path key={a} d="M0-6.6C1.4-8 1.4-10 0-11.6C-1.4-10-1.4-8 0-6.6Z" fill={t.base} transform={`rotate(${a})`} />
      ))}
      {spin(n, 360 / n / 2).map((a) => (
        <path key={`b${a}`} d="M0-6.2C1.1-7.2 1.1-8.6 0-9.8C-1.1-8.6-1.1-7.2 0-6.2Z" fill={t.light} transform={`rotate(${a})`} />
      ))}
      <circle r="5.6" fill={t.deep} />
      {spin(9).map((a) => (
        <circle key={a} cx="0" cy="-3.3" r=".55" fill={t.light} opacity=".8" transform={`rotate(${a})`} />
      ))}
      {spin(4, 20).map((a) => (
        <circle key={`c${a}`} cx="0" cy="-1.5" r=".5" fill={t.light} opacity=".8" transform={`rotate(${a})`} />
      ))}
    </>
  ),

  // five broad frilled petals with one long stamen that breaks the symmetry
  hibiscus: (t) => (
    <>
      {spin(5).map((a) => (
        <path key={a} d="M0 0C-6.4-3-7-9.4-2.8-11Q-1.2-10 0-10.8Q1.2-10 2.8-11C7-9.4 6.4-3 0 0Z" fill={t.base} stroke={t.light} strokeWidth=".4" transform={`rotate(${a})`} />
      ))}
      <circle r="2.6" fill={t.deep} />
      <path d="M0 0C2-2 3.2-4.6 4.6-7" fill="none" stroke="#f8d86a" strokeWidth=".9" strokeLinecap="round" />
      {[[3.4, -5.4], [4.6, -7], [5.6, -6]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r=".85" fill="#f8d86a" />
      ))}
    </>
  ),

  // a hanging bell with a scalloped lip (not radial)
  bell: (t) => (
    <>
      <path d="M0-9.2C0-11 1-11.6 2.2-11.6" fill="none" stroke={t.deep} strokeWidth="1" strokeLinecap="round" />
      <path d="M-6.4 4C-6.4-4-3.4-9-0-9C3.4-9 6.4-4 6.4 4Q4.8 6.4 3.2 4Q1.6 6.4 0 4Q-1.6 6.4-3.2 4Q-4.8 6.4-6.4 4Z" fill={t.base} stroke={t.light} strokeWidth=".5" />
      <path d="M-2.2 3.6C-3-1-1.6-5.4 0-6.6" fill="none" stroke={t.light} strokeWidth=".8" strokeLinecap="round" />
      <circle cx="0" cy="6.6" r="1.1" fill={t.cream} stroke={t.deep} strokeWidth=".4" />
    </>
  ),
}

export function Flower({
  hue,
  size = 18,
  shape = 'classic',
  petals,
  className = '',
}: {
  hue: number
  size?: number
  shape?: FlowerShape
  /** Only for shapes built from repeated petals (classic, daisy, lily, cosmos, pinwheel, sunflower). */
  petals?: number
  className?: string
}) {
  const def = FLOWER_SHAPES.find((s) => s.id === shape)
  const n = Math.max(3, Math.min(20, petals ?? def?.petals ?? 5))
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" className={className} aria-hidden>
      {SHAPES[shape](tones(hue), n)}
    </svg>
  )
}
