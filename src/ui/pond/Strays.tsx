import { useEffect, useRef, useState } from 'react'
import { satOf } from '../../core/color'
import * as sound from '../../audio/engine'

type Stray = { id: number; hue: number; x: number; y: number; r: number; dur: number; delay: number }

/**
 * Pop mode's spare bubbles: not items at all, just bubbles in the colours of the real ones (no words or marks), scattered
 * over the pond to be popped. They scale up when pop mode starts and shrink away when it stops. Popped ones are replaced a
 * little slower than they are being popped, so the field can be cleared but never stays empty for long.
 */
export function Strays({ active, w, h, getAvoid, hues, onPop }: { active: boolean; w: number; h: number; getAvoid: () => { x: number; y: number; r: number }[]; hues: number[]; onPop?: () => void }) {
  const [list, setList] = useState<Stray[]>([])
  const [leaving, setLeaving] = useState(false)
  const [popped, setPopped] = useState<Set<number>>(new Set())
  const next = useRef(0)
  const leavingRef = useRef(false)
  leavingRef.current = !active || leaving

  /** A new stray somewhere clear of the real bubbles and the others (null if there is no room). */
  const make = (others: Stray[]): Stray | null => {
    const avoid = getAvoid()
    for (let tries = 0; tries < 40; tries++) {
      const r = 27 + Math.random() * 15
      const x = r + Math.random() * (w - 2 * r)
      const y = r + Math.random() * (h - 2 * r)
      if (avoid.some((a) => Math.hypot(a.x - x, a.y - y) < a.r + r + 6)) continue
      if (others.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 6)) continue
      return { id: next.current++, hue: hues.length ? hues[Math.floor(Math.random() * hues.length)] : 285, x, y, r, dur: 5 + Math.random() * 4, delay: -Math.random() * 6 }
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
    const go = () => {
      p.timer = 0
      if (leavingRef.current || p.waiting <= 0) return void (p.waiting = 0)
      p.waiting -= 1
      setList((l) => {
        const one = make(l)
        return one ? [...l, one] : l
      })
      if (p.waiting > 0) p.timer = window.setTimeout(go, Math.min(1500, Math.max(400, p.avg * 1.3)))
    }
    if (!p.timer) p.timer = window.setTimeout(go, Math.min(1500, Math.max(400, p.avg * 1.3)))
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
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

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
                    if (gone) return
                    sound.pop()
                    setPopped((p) => new Set(p).add(s.id))
                    onPop?.()
                    // it goes, and a new one floats up somewhere else, so there is always something left to pop
                    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== s.id)), 450)
                    queueNew()
                  }}
                  className="pad block h-full w-full cursor-pointer touch-none select-none rounded-full"
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
