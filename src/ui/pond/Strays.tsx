import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { satOf } from '../../core/color'
import * as sound from '../../audio/engine'

type Stray = { id: number; fade?: boolean; enter?: number; hue: number; u: number; x: number; y: number; r: number; dur: number; delay: number }

/** How vivid a plain bubble is: some variety, but never so pale that two colours look alike (50% at the least). */
const vivid = () => 0.5 + Math.random() * 0.5

/** What the pop game needs from the field: how many bubbles there are of each of its colours, and a way to add more. */
export interface StrayField {
  counts: (pool: number[]) => number[]
  add: (hues: number[]) => void
}

interface StraysProps {
  active: boolean
  w: number
  h: number
  getAvoid: () => { x: number; y: number; r: number }[]
  /** the part of the water that is in view and free of buttons, in the water's own units, and the zoom: new bubbles go there, at a size that looks the same at any zoom */
  getArea?: () => { x0: number; y0: number; x1: number; y1: number; scale: number }
  /** every bubble is one of these (the real ones are put away): they begin where the real ones were, with their sizes and colours */
  seeded?: boolean
  getSeed?: () => { x: number; y: number; r: number; hue: number; u?: number }[]
  /** the colours to draw from (the pop game's); none means any colour at all */
  hues?: number[]
  /** the colour currently lit up in the game */
  litHue?: number | null
  canPop?: (hue: number) => boolean
  onPop?: (hue: number, x: number, y: number, r: number) => void
  /** for fun, when every bubble has been popped (true), until the field fills again (false) */
  onCleared?: (cleared: boolean) => void
}

const CLEARED_MS = 1900

/**
 * Pop mode's spare bubbles: not items at all, just bubbles with nothing written on them, at random sizes, colours and
 * places. They scale up when pop mode starts and shrink away when it stops. For fun, popped ones are replaced a little
 * slower than they are being popped (never closer than 1.5 seconds), and if the whole field is cleared it says so and
 * fills again. In the pop game their colours are the game's own, and the game adds new ones between rounds.
 */
export const Strays = forwardRef<StrayField, StraysProps>(function Strays({ active, w, h, getAvoid, getArea, seeded = false, getSeed, hues, litHue = null, canPop, onPop, onCleared }, ref) {
  const [list, setList] = useState<Stray[]>([])
  const [leaving, setLeaving] = useState(false)
  const [popped, setPopped] = useState<Set<number>>(new Set())
  const next = useRef(0)
  const leavingRef = useRef(false)
  leavingRef.current = !active || leaving
  const live = useRef({ hues, getAvoid, getArea, getSeed, seeded, canPop, onPop, onCleared, w, h })
  live.current = { hues, getAvoid, getArea, getSeed, seeded, canPop, onPop, onCleared, w, h }
  const listRef = useRef(list)
  listRef.current = list
  const poppedRef = useRef(popped)
  poppedRef.current = popped
  const mode = `${seeded ? 'seeded' : 'free'}-${hues ? 'colours' : 'any'}`

  /** A new stray at a random size, colour and place, clear of the real bubbles and the others (null if there is no room). */
  const make = (others: Stray[], hue?: number): Stray | null => {
    const { hues: pool, getAvoid: avoidNow, w: W, h: H } = live.current
    // (when the real bubbles are put away there is nothing to keep clear of but the other plain ones)
    const avoid = live.current.seeded ? [] : avoidNow()
    const A = live.current.getArea?.() ?? { x0: 0, y0: 0, x1: W, y1: H, scale: 1 }
    const aw = A.x1 - A.x0
    const ah = A.y1 - A.y0
    if (aw < 60 / A.scale || ah < 60 / A.scale) return null
    // sizes are what they look like on screen, so they are the same however far in or out the view is
    const biggest = Math.max(30, Math.min(80, (Math.min(aw, ah) * A.scale) / 6))
    for (let tries = 0; tries < 40; tries++) {
      // mostly small, now and then a big one
      const r = (24 + Math.pow(Math.random(), 1.6) * (biggest - 24)) / A.scale
      if (2 * r > Math.min(aw, ah)) continue
      const x = A.x0 + r + Math.random() * (aw - 2 * r)
      const y = A.y0 + r + Math.random() * (ah - 2 * r)
      if (avoid.some((a) => Math.hypot(a.x - x, a.y - y) < a.r + r + 6 / A.scale)) continue
      if (others.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 6 / A.scale)) continue
      const hu = hue ?? (pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * 360))
      return { id: next.current++, hue: hu, u: vivid(), x, y, r, dur: 5 + Math.random() * 4, delay: -Math.random() * 6 }
    }
    return null
  }

  // New ones come a little slower than they are being popped, but never closer together than 1.5 seconds
  const pace = useRef({ last: 0, avg: 1000, waiting: 0, timer: 0 })
  const clearing = useRef(0)
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

  /** A whole new field of random bubbles, appearing one after another: enough to cover about `cover` of the water. */
  const fill = (cover = 0.2) => {
    const { w: W, h: H } = live.current
    const A = live.current.getArea?.() ?? { x0: 0, y0: 0, x1: W, y1: H }
    const out: Stray[] = []
    let area = 0
    for (let i = 0; i < 90 && area < cover * (A.x1 - A.x0) * (A.y1 - A.y0); i++) {
      const one = make(out)
      if (!one) break
      area += Math.PI * one.r * one.r
      out.push({ ...one, enter: i * 60 })
    }
    return out
  }

  useEffect(() => {
    if (active) {
      window.clearTimeout(pace.current.timer)
      window.clearTimeout(clearing.current)
      pace.current = { last: 0, avg: 1000, waiting: 0, timer: 0 }
      setLeaving(false)
      setPopped(new Set())
      const seed = live.current.getSeed?.()
      if (seeded && seed && seed.length) {
        // the real bubbles' places, sizes and colours (in the game, the nearest of the game's colours), as plain ones
        const pool = live.current.hues
        const near = (hue: number) => (pool && pool.length ? pool.reduce((best, c) => (Math.abs(((c - hue + 540) % 360) - 180) < Math.abs(((best - hue + 540) % 360) - 180) ? c : best), pool[0]) : hue)
        setList(seed.map((b) => ({ id: next.current++, fade: true, hue: near(b.hue), u: b.u ?? vivid(), x: b.x, y: b.y, r: b.r, dur: 5 + Math.random() * 4, delay: 0 })))
      } else setList(fill())
      return
    }
    window.clearTimeout(clearing.current)
    live.current.onCleared?.(false)
    if (!list.length) return
    setLeaving(true)
    const t = window.setTimeout(() => setList([]), 380)
    return () => window.clearTimeout(t)
  }, [active, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // for fun: when the last bubble is gone, say so, then fill the field again
  const hadAny = useRef(false)
  useEffect(() => {
    // (bubbles that have been popped but are still bursting do not count)
    const left = list.filter((x) => !popped.has(x.id)).length
    if (left) hadAny.current = true
    if (!active || leaving || hues || !seeded || left || !hadAny.current || clearing.current) return
    hadAny.current = false
    window.clearTimeout(pace.current.timer)
    pace.current.timer = 0
    pace.current.waiting = 0
    live.current.onCleared?.(true)
    clearing.current = window.setTimeout(() => {
      clearing.current = 0
      live.current.onCleared?.(false)
      if (!leavingRef.current) setList(fill(0.4)) // about twice what the field began with, so the cleared water fills up
    }, CLEARED_MS)
  }, [list, popped, active, leaving, hues, seeded]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    counts: (pool) => pool.map((hue) => listRef.current.filter((s) => s.hue === hue && !poppedRef.current.has(s.id)).length),
    add: (adds) =>
      adds.forEach((hue, i) =>
        window.setTimeout(() => {
          if (leavingRef.current) return
          setList((l) => {
            const one = make(l, hue)
            if (one) sound.spawn()
            return one ? [...l, one] : l
          })
        }, i * 110),
      ),
  }))

  return (
    <>
      {list.map((s) => {
        const gone = popped.has(s.id)
        return (
          <div key={s.id} data-ui data-stray className={`absolute left-0 top-0 ${leaving ? 'pointer-events-none' : ''}`} style={{ width: s.r * 2, height: s.r * 2, transform: `translate(${s.x - s.r}px, ${s.y - s.r}px)` }}>
            <div className={leaving ? 'stray-out' : s.fade ? 'stray-fade' : 'stray-in'} style={{ animationDelay: leaving || s.fade ? '0s' : `${s.enter ?? (s.id % 7) * 40}ms` }}>
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
                    poppedRef.current = new Set(poppedRef.current).add(s.id) // (at once, so the game counts what is left correctly)
                    setPopped(poppedRef.current)
                    live.current.onPop?.(s.hue, s.x, s.y, s.r)
                    // it goes; for fun a new one floats up somewhere else (in the game they are added between rounds)
                    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== s.id)), 450)
                    if (!live.current.hues) queueNew()
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
})
