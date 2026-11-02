import { useEffect, useRef, useState } from 'react'
import * as sound from '../../audio/engine'

type Stray = { id: number; x: number; y: number; r: number; dur: number; delay: number }

/**
 * Pop mode's spare bubbles: small, plain and not items at all, scattered over the pond just to be popped (so there is
 * always something to pop that is not a task). They scale up when pop mode starts and shrink away when it stops.
 */
export function Strays({ active, w, h, getAvoid, onPop }: { active: boolean; w: number; h: number; getAvoid: () => { x: number; y: number; r: number }[]; onPop?: () => void }) {
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
      return { id: next.current++, x, y, r, dur: 5 + Math.random() * 4, delay: -Math.random() * 6 }
    }
    return null
  }

  useEffect(() => {
    if (active) {
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
                  aria-label="Pop me!"
                  disabled={gone}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    if (gone) return
                    sound.pop()
                    setPopped((p) => new Set(p).add(s.id))
                    onPop?.()
                    // it goes, and a new one floats up somewhere else, so there is always something left to pop
                    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== s.id)), 450)
                    window.setTimeout(() => setList((l) => {
                        if (leavingRef.current) return l
                        const one = make(l)
                        return one ? [...l, one] : l
                      }), 900)
                  }}
                  className="stray grid h-full w-full cursor-pointer touch-none select-none place-items-center rounded-full p-1 text-center font-sans font-medium leading-tight text-ink-soft"
                  style={{ fontSize: s.r * 0.36, width: s.r * 2, height: s.r * 2 }}
                >
                  Pop me!
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
