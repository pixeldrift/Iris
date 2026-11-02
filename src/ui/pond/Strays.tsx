import { useEffect, useRef, useState } from 'react'
import { satOf } from '../../core/color'
import * as sound from '../../audio/engine'

type Stray = { id: number; hue: number; x: number; y: number; r: number; dur: number; delay: number }

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
  hues,
  litHue = null,
  canPop,
  onPop,
}: {
  active: boolean
  w: number
  h: number
  getAvoid: () => { x: number; y: number; r: number }[]
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
  const live = useRef({ hues, getAvoid, canPop, onPop, w, h })
  live.current = { hues, getAvoid, canPop, onPop, w, h }
  const mode = hues ? 'colours' : 'any'

  /** A new stray at a random size, colour and place, clear of the real bubbles and the others (null if there is no room). */
  const make = (others: Stray[]): Stray | null => {
    const { hues: pool, getAvoid: avoidNow, w: W, h: H } = live.current
    const avoid = avoidNow()
    const biggest = Math.max(30, Math.min(80, Math.min(W, H) / 6))
    for (let tries = 0; tries < 40; tries++) {
      // mostly small, now and then a big one
      const r = 24 + Math.pow(Math.random(), 1.6) * (biggest - 24)
      const x = r + Math.random() * (W - 2 * r)
      const y = r + Math.random() * (H - 2 * r)
      if (avoid.some((a) => Math.hypot(a.x - x, a.y - y) < a.r + r + 6)) continue
      if (others.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 6)) continue
      const hue = pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * 360)
      return { id: next.current++, hue, x, y, r, dur: 5 + Math.random() * 4, delay: -Math.random() * 6 }
    }
    return null
  }

  // New ones come at a pace set by how fast you are popping (a bit slower), between 0.4 and 1.5 seconds apart
  const pace = useRef({ last: 0, avg: 1000, waiting: 0, timer: 0 })
  const queueNew = () => {
    const p = pace.current
    const now = Date.now()
    if (p.last) p.avg = 0.6 * p.avg + 0.4 * Math.min(3000, now - p.last)
    p.last = now
    p.waiting += 1
    const gap = () => Math.min(1500, Math.max(400, p.avg * 1.3))
    const go = () => {
      p.timer = 0
      if (leavingRef.current || p.waiting <= 0) return void (p.waiting = 0)
      p.waiting -= 1
      setList((l) => {
        const one = make(l)
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
      const count = Math.max(8, Math.min(22, Math.round((w * h) / 90_000)))
      const out: Stray[] = []
      for (let i = 0; i < count; i++) {
        const one = make(out)
        if (one) out.push(one)
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
            <div className={leaving ? 'stray-out' : 'stray-in'} style={{ animationDelay: leaving ? '0s' : `${(s.id % 7) * 40}ms` }}>
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
                  style={{ width: s.r * 2, height: s.r * 2, '--h': Math.max(0, s.hue), '--s': satOf(s.hue), '--u': 0.3 } as React.CSSProperties}
                />
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
