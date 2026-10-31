import { useLayoutEffect, useRef } from 'react'

const FLOOR = 0.72
const STEP = 0.04

/**
 * A bubble's title that never gets a hard cut. The type shrinks a little (down to about 70%) until the whole title fits
 * the bubble's room, and if it still can't, the last line fades out instead of being sliced off. The shrink is a
 * ratio (`--fit`), so it holds while the bubble is resized by dragging; `watch` re-measures when the bubble's size changes.
 */
export function TitleFit({ text, font, lineHeight, className = '', done = false, watch = 0 }: { text: string; font: string; lineHeight: number; className?: string; done?: boolean; watch?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const cs = getComputedStyle(box)
    let room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    // whatever else sits in the flow under the title (the due chip) takes its share
    for (const c of Array.from(box.children)) if (c !== el && getComputedStyle(c).position !== 'absolute') room -= (c as HTMLElement).offsetHeight + 4
    el.style.maxHeight = ''
    el.style.maskImage = el.style.webkitMaskImage = ''
    let fit = 1
    el.style.setProperty('--fit', '1')
    while (el.scrollHeight > room + 1 && fit > FLOOR) {
      fit = Math.max(FLOOR, fit - STEP)
      el.style.setProperty('--fit', String(fit))
    }
    if (el.scrollHeight > room + 1) {
      // still too long: keep whole lines and let the last one dissolve
      const line = parseFloat(getComputedStyle(el).fontSize) * lineHeight
      const lines = Math.max(1, Math.floor(room / line))
      el.style.maxHeight = `${lines * line}px`
      el.style.overflow = 'hidden'
      const fade = 'linear-gradient(to bottom, #000 calc(100% - 0.9em), transparent)'
      el.style.maskImage = el.style.webkitMaskImage = fade
    }
  }, [text, font, lineHeight, watch])
  return (
    <span ref={ref} className={`break-words font-display ${done ? 'line-through decoration-lilac-300' : ''} ${className}`} style={{ fontSize: `calc(${font} * var(--fit, 1))`, lineHeight, textShadow: '0 0 3px rgba(255,255,255,0.95), 0 0 7px rgba(255,255,255,0.7)' }}>
      {text}
    </span>
  )
}
