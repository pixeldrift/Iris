import { useEffect, useRef, useState } from 'react'
import { satOf } from '../../core/color'
import * as sound from '../../audio/engine'

type Stray = { id: number; fade?: boolean; hue: number; u: number; x: number; y: number; r: number; dur: number; delay: number }

/** How vivid a plain bubble is: some variety, but never so pale that two colours look alike (25% at the least). */
const vivid = () => 0.25 + Math.random() * 0.6

/**
 * Pop mode's spare bubbles: not items at all, just bubbles with nothing written on them, at random sizes, colours and
 * places. They scale up when pop mode starts and shrink away when it stops. Popped ones are replaced a little slower than
 * they are being popped, so the field can be cleared but never stays empty for long. In the pop game their colours are
 * the game's own (`hues`), so they can be played too.
 */
export function Strays({
  active,
  w,
  h,
  getAvoid,
  seeded = false,
  getSeed,
  hues,
  litHue = null,
  canPop,
  onPop,
}: {
  active: boolean
  w: number
  h: number
  getAvoid: () => { x: number; y: number; r: number }[]
  /** every bubble is one of these (the real ones are put away): they begin where the real ones were, with their sizes and colours */
  seeded?: boolean
  getSeed?: () => { x: number; y: number; r: number; hue: number }[]
  /** the colours to draw from; none means any colour at all */
  hues?: number[]
  /** the colour currently lit up in the game */
  litHue?: number | null
  canPop?: (hue: number) => boolean
  onPop?: (hue: number, x: number, y: number, r: number) => void
}) {
  const [list, setList] = useState<Stray[]>([])
  const [leaving, setLeaving] = useState(false)
  const [popped, setPopped] = useState<Set<number>>(new Set())
  const next = useRef(0)
  const leavingRef = useRef(false)
  leavingRef.current = !active || leaving
  const live = useRef({ hues, getAvoid, getSeed, seeded, canPop, onPop, w, h })
  live.current = { hues, getAvoid, getSeed, seeded, canPop, onPop, w, h }
  const mode = `${seeded ? 'seeded' : 'free'}-${hues ? 'colours' : 'any'}`

  /** A new stray at a random size, colour and place, clear of the real bubbles and the others (null if there is no room). */
  const make = (others: Stray[]): Stray | null => {
    const { hues: pool, getAvoid: avoidNow, w: W, h: H } = live.current
    // (when the real bubbles are put away there is nothing to keep clear of but the other plain ones)
    const avoid = live.current.seeded ? [] : avoidNow()
    const biggest = Math.max(30, Math.min(80, Math.min(W, H) / 6))
    for (let tries = 0; tries < 40; tries++) {
      // mostly small, now and then a big one
      const r = 24 + Math.pow(Math.random(), 1.6) * (biggest - 24)
      const x = r + Math.random() * (W - 2 * r)
      const y = r + Math.random() * (H - 2 * r)
      if (avoid.some((a) => Math.hypot(a.x - x, a.y - y) < a.r + r + 6)) continue
      if (others.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 6)) continue
      const hue = pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * 360)
      return { id: next.current++, hue, u: vivid(), x, y, r, dur: 5 + Math.random() * 4, delay: -Math.random() * 6 }
    }
    return null
  }

  // New ones come a little slower than they are being popped, but never closer together than 1.5 seconds
  const pace = useRef({ last: 0, avg: 1000, waiting: 0, timer: 0 })
  const queueNew = () => {
    const p = pace.current
    const now = Date.now()
    if (p.last) p.avg = 0.6 * p.avg + 0.4 * Math.min(3000, now - p.last)
    p.last = now
    p.waiting += 1
    // never faster than one every 1.5 seconds, however quickly they are popped, so the board can always be cleared
    const gap = () => Math.min(3000, Math.max(1500, p.avg * 1.5))
    const go = () => {
      p.timer = 0
      if (leavingRef.current || p.waiting <= 0) return void (p.waiting = 0)
      p.waiting -= 1
      setList((l) => {
        const one = make(l)
        if (one) sound.spawn()
        return one ? [...l, one] : l
      })
      if (p.waiting > 0) p.timer = window.setTimeout(go, gap())
    }
    if (!p.timer) p.timer = window.setTimeout(go, gap())
  }

  useEffect(() => {
    if (active) {
      window.clearTimeout(pace.current.timer)
      pace.current = { last: 0, avg: 1000, waiting: 0, timer: 0 }
      setLeaving(false)
      setPopped(new Set())
      const seed = live.current.getSeed?.()
      const out: Stray[] = []
      if (seeded && seed && seed.length) {
        // the real bubbles' places, sizes and colours (in the game, the nearest of the game's colours), as plain ones
        const pool = live.current.hues
        const near = (hue: number) => (pool && pool.length ? pool.reduce((best, c) => (Math.abs(((c - hue + 540) % 360) - 180) < Math.abs(((best - hue + 540) % 360) - 180) ? c : best), pool[0]) : hue)
        for (const b of seed) out.push({ id: next.current++, fade: true, hue: near(b.hue), u: vivid(), x: b.x, y: b.y, r: b.r, dur: 5 + Math.random() * 4, delay: -Math.random() * 6 })
      } else {
        const count = Math.max(8, Math.min(22, Math.round((w * h) / 90_000)))
        for (let i = 0; i < count; i++) {
          const one = make(out)
          if (one) out.push(one)
        }
      }
      setList(out)
      return
    }
    if (!list.length) return
    setLeaving(true)
    const t = window.setTimeout(() => setList([]), 380)
    return () => window.clearTimeout(t)
  }, [active, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {list.map((s) => {
        const gone = popped.has(s.id)
        return (
          <div key={s.id} data-ui data-stray className="absolute left-0 top-0" style={{ width: s.r * 2, height: s.r * 2, transform: `translate(${s.x - s.r}px, ${s.y - s.r}px)` }}>
            <div className={leaving ? 'stray-out' : s.fade ? 'stray-fade' : 'stray-in'} style={{ animationDelay: leaving || s.fade ? '0s' : `${(s.id % 7) * 40}ms` }}>
              <div className={gone ? 'burst' : 'stray-bob'} style={{ '--dur': `${s.dur}s`, '--delay': `${s.delay}s` } as React.CSSProperties}>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Bubble"
                  disabled={gone}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    if (gone || live.current.canPop?.(s.hue) === false) return
                    sound.pop()
                    setPopped((p) => new Set(p).add(s.id))
                    live.current.onPop?.(s.hue, s.x, s.y, s.r)
                    // it goes, and a new one floats up somewhere else, so there is always something left to pop
                    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== s.id)), 450)
                    queueNew()
                  }}
                  className={`pad block h-full w-full cursor-pointer touch-none select-none rounded-full ${litHue !== null && litHue === s.hue ? 'game-lit' : ''}`}
                  data-hue={s.hue}
                  style={{ width: s.r * 2, height: s.r * 2, '--h': Math.max(0, s.hue), '--s': satOf(s.hue), '--u': s.u } as React.CSSProperties}
                />
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
