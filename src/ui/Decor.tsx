import { useMemo } from 'react'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 240
const H = 420
const SCALE = 2

type Art = { mask: string; leaves: string }
const cache = new Map<number, Art>()

/**
 * One lilac panicle, drawn once into two small bitmaps instead of hundreds of SVG shapes: a silhouette of the
 * florets (used as a CSS mask, so the theme's violet shows through it and recolors for free) and the stem and leaves.
 * The page used to carry ~1,500 SVG elements for this; it is now two image layers per sprig.
 */
function paint(seed: number): Art {
  const hit = cache.get(seed)
  if (hit) return hit
  const make = () => {
    const c = document.createElement('canvas')
    c.width = W * SCALE
    c.height = H * SCALE
    const ctx = c.getContext('2d')!
    ctx.scale(SCALE, SCALE)
    return { c, ctx }
  }
  const r = rng(seed)
  const { c: m, ctx: mx } = make()
  for (let i = 0; i < 110; i++) {
    const t = Math.pow(r(), 0.85)
    const y = 30 + t * 250
    const spread = Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)) * 62 * (0.4 + t * 0.6)
    const x = 120 + (r() * 2 - 1) * spread
    const s = 0.7 + r() * 0.7
    const rot = (r() * 90 * Math.PI) / 180
    const o = 0.55 + r() * 0.45
    mx.save()
    mx.translate(x, y)
    mx.rotate(rot)
    mx.scale(s, s)
    mx.fillStyle = `rgba(0,0,0,${o})`
    for (let a = 0; a < 4; a++) {
      mx.save()
      mx.rotate((a * Math.PI) / 2)
      mx.beginPath()
      mx.ellipse(0, -5, 3.4, 5.6, 0, 0, Math.PI * 2)
      mx.fill()
      mx.restore()
    }
    mx.restore()
  }
  const { c: l, ctx: lx } = make()
  lx.globalAlpha = 0.7
  lx.strokeStyle = '#b9d3c0'
  lx.lineWidth = 2.2
  lx.beginPath()
  lx.moveTo(120, 20)
  lx.bezierCurveTo(118, 140, 124, 260, 120, 420)
  lx.stroke()
  lx.fillStyle = '#cfe4d6'
  lx.beginPath()
  lx.moveTo(121, 330)
  lx.bezierCurveTo(80, 300, 40, 310, 20, 340)
  lx.bezierCurveTo(50, 360, 100, 360, 121, 330)
  lx.fill()
  lx.globalAlpha = 0.65
  lx.fillStyle = '#c2dccb'
  lx.beginPath()
  lx.moveTo(121, 370)
  lx.bezierCurveTo(160, 335, 205, 345, 225, 378)
  lx.bezierCurveTo(190, 396, 140, 396, 121, 370)
  lx.fill()
  const art = { mask: m.toDataURL('image/png'), leaves: l.toDataURL('image/png') }
  cache.set(seed, art)
  return art
}

/** A drooping lilac panicle. */
export function LilacSprig({ seed = 1, className = '' }: { seed?: number; className?: string }) {
  const art = useMemo(() => paint(seed), [seed])
  return (
    <div className={className} style={{ aspectRatio: `${W} / ${H}` }} aria-hidden>
      <div className="absolute inset-0" style={{ backgroundImage: `url(${art.leaves})`, backgroundSize: '100% 100%' }} />
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(165deg, var(--color-lilac-200), var(--color-lilac-300) 42%, var(--color-lilac-400))',
          WebkitMaskImage: `url(${art.mask})`,
          maskImage: `url(${art.mask})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
        }}
      />
    </div>
  )
}

/** Fixed, faint florals behind everything. */
export function Decor() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
      <LilacSprig seed={7} className="absolute -right-10 -top-16 w-72 rotate-[14deg] opacity-40 sm:w-96" />
      <LilacSprig seed={21} className="absolute -bottom-24 -left-10 w-64 -rotate-[158deg] opacity-30 sm:w-80" />
    </div>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-16 -16 32 32" aria-hidden>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-8" rx="5.2" ry="8" style={{ fill: 'var(--color-lilac-400)' }} opacity=".75" transform={`rotate(${a})`} />
      ))}
      <circle r="3.4" fill="#fff" opacity=".9" />
    </svg>
  )
}
