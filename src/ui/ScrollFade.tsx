import { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevron } from './icons'

/**
 * A scroll area that softly fades its content out at an edge when more lies
 * beyond it, with a small bobbing arrow (tap to scroll) to say so.
 */
export function ScrollFade({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ top: false, bottom: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const top = el.scrollTop > 6
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight > 6
    setEdge((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [update])

  const by = (dir: 1 | -1) => ref.current?.scrollBy({ top: dir * Math.max(140, (ref.current?.clientHeight ?? 0) * 0.6), behavior: 'smooth' })

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        className={`scroll-soft fade-mask h-full touch-pan-y overflow-y-auto ${className}`}
        data-top={edge.top || undefined}
        data-bottom={edge.bottom || undefined}
      >
        {children}
      </div>
      <Arrow dir="up" show={edge.top} onClick={() => by(-1)} />
      <Arrow dir="down" show={edge.bottom} onClick={() => by(1)} />
    </div>
  )
}

function Arrow({ dir, show, onClick }: { dir: 'up' | 'down'; show: boolean; onClick: () => void }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${dir === 'up' ? 'top-0.5' : 'bottom-0.5'}`}>
      <button
        onClick={onClick}
        tabIndex={show ? 0 : -1}
        aria-hidden={!show}
        aria-label={dir === 'up' ? 'Scroll up' : 'Scroll down'}
        className={`grid h-6 w-6 place-items-center rounded-full text-lilac-600 transition-opacity duration-300 hover:bg-white/60 ${
          show ? 'pointer-events-auto opacity-80' : 'opacity-0'
        } ${dir === 'up' ? 'arrow-bob-up' : 'arrow-bob-down'}`}
      >
        <span className={dir === 'up' ? '-rotate-90' : 'rotate-90'}>
          <IconChevron size={16} />
        </span>
      </button>
    </div>
  )
}
