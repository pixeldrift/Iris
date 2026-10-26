import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Shown {
  label: string
  x: number
  y: number
  sticky: boolean
  n: number
}

/**
 * Tooltip for icon buttons that works without hover. Tapping flashes the label
 * above the icon; it floats up and fades. A mouse hover keeps it visible.
 */
export function Tip({ label, children }: { label: string; children: React.ReactElement<Record<string, unknown>> }) {
  const [tip, setTip] = useState<Shown | null>(null)
  const ref = useRef<HTMLElement | null>(null)
  const timer = useRef<number>(0)
  const n = useRef(0)
  const bubble = useRef<HTMLSpanElement>(null)
  // keep the label fully on screen whatever the icon's position
  useLayoutEffect(() => {
    const el = bubble.current
    if (!el || !tip) return
    const half = el.offsetWidth / 2 + 8
    el.style.left = `${Math.min(window.innerWidth - half, Math.max(half, tip.x))}px`
  }, [tip])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const show = (sticky: boolean) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    window.clearTimeout(timer.current)
    n.current += 1
    setTip({ label, x: Math.min(window.innerWidth - 8, Math.max(8, r.left + r.width / 2)), y: r.top - 8, sticky, n: n.current })
    if (!sticky) timer.current = window.setTimeout(() => setTip(null), 1700)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setTip((t) => (t?.sticky ? null : t))
  }

  const props = children.props as Record<string, (e: React.SyntheticEvent) => void>
  const child = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      ref.current = el
    },
    'aria-label': (children.props['aria-label'] as string) ?? label,
    onPointerEnter: (e: React.PointerEvent) => {
      props.onPointerEnter?.(e)
      if (e.pointerType === 'mouse') timer.current = window.setTimeout(() => show(true), 350)
    },
    onPointerLeave: (e: React.PointerEvent) => {
      props.onPointerLeave?.(e)
      window.clearTimeout(timer.current)
      hide()
    },
    onPointerDown: (e: React.PointerEvent) => {
      props.onPointerDown?.(e)
      if (e.pointerType !== 'mouse') show(false)
    },
  })

  return (
    <>
      {child}
      {tip &&
        createPortal(
          <span
            ref={bubble}
            key={tip.n}
            className={`pointer-events-none fixed z-[200] whitespace-nowrap rounded-full bg-ink/90 px-3 py-1 text-xs text-white shadow-lg ${
              tip.sticky ? 'pop-in' : 'tip-float'
            }`}
            style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, -100%)', ['--ox' as string]: '50%', ['--oy' as string]: '100%' }}
          >
            {tip.label}
          </span>,
          document.body,
        )}
    </>
  )
}
