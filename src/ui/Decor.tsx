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

const SHADES = ['#e1d0f4', '#cdb1eb', '#b78fdf', '#d8bff0', '#c9a6e8', '#ecdcf8']

/** A drooping lilac panicle: a few hundred tiny four-petal florets. */
export function LilacSprig({ seed = 1, className = '' }: { seed?: number; className?: string }) {
  const parts = useMemo(() => {
    const r = rng(seed)
    const florets: { x: number; y: number; s: number; rot: number; c: string; o: number }[] = []
    for (let i = 0; i < 110; i++) {
      const t = Math.pow(r(), 0.85)
      const y = 30 + t * 250
      const spread = Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)) * 62 * (0.4 + t * 0.6)
      const x = 120 + (r() * 2 - 1) * spread
      florets.push({ x, y, s: 0.7 + r() * 0.7, rot: r() * 90, c: SHADES[Math.floor(r() * SHADES.length)], o: 0.55 + r() * 0.45 })
    }
    return florets
  }, [seed])

  return (
    <svg viewBox="0 0 240 420" className={className} aria-hidden>
      <path d="M120 20 C 118 140, 124 260, 120 420" stroke="#b9d3c0" strokeWidth="2.2" fill="none" opacity=".7" />
      <path d="M121 330 C 80 300, 40 310, 20 340 C 50 360, 100 360, 121 330Z" fill="#cfe4d6" opacity=".7" />
      <path d="M121 370 C 160 335, 205 345, 225 378 C 190 396, 140 396, 121 370Z" fill="#c2dccb" opacity=".65" />
      {parts.map((f, i) => (
        <g key={i} transform={`translate(${f.x} ${f.y}) rotate(${f.rot}) scale(${f.s})`} opacity={f.o}>
          {[0, 90, 180, 270].map((a) => (
            <ellipse key={a} cx="0" cy="-5" rx="3.4" ry="5.6" fill={f.c} transform={`rotate(${a})`} />
          ))}
          <circle r="1.5" fill="#fff" opacity=".85" />
        </g>
      ))}
    </svg>
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
        <ellipse key={a} cx="0" cy="-8" rx="5.2" ry="8" fill="#b78fdf" opacity=".75" transform={`rotate(${a})`} />
      ))}
      <circle r="3.4" fill="#fff" opacity=".9" />
    </svg>
  )
}
