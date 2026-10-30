import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * The sliding-highlight pill used for "pick one of a few": the highlight glides to the chosen option, and the
 * little dividers between options vanish next to it. `value` may be null when nothing is chosen.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
  iconsOnly = false,
  fill = false,
}: {
  options: readonly { id: T; label: string; icon?: React.ReactNode }[]
  value: T | null
  onChange: (v: T) => void
  label: string
  className?: string
  /** options with an icon show only the icon on a phone, icon and label from the small breakpoint up */
  iconsOnly?: boolean
  /** on a phone, stretch to the full width with the options sharing it evenly */
  fill?: boolean
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  const settled = useRef(false)
  useLayoutEffect(() => {
    const el = value === null ? undefined : refs.current.get(value)
    // offsets, not screen rects: the box is still scaling in when this first runs
    setBox(el ? { left: el.offsetLeft + (el.parentElement?.offsetLeft ?? 0), width: el.offsetWidth } : null)
  }, [value, options])
  useEffect(() => {
    // no slide on the very first placement
    const id = requestAnimationFrame(() => (settled.current = true))
    return () => cancelAnimationFrame(id)
  }, [])
  const spring = 'cubic-bezier(0.34, 1.35, 0.55, 1)'
  return (
    <div role="radiogroup" aria-label={label} className={`no-scrollbar relative ${fill ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex'} max-w-full min-w-0 items-center overflow-x-auto rounded-full bg-white/50 p-0.5 shadow-[inset_0_1px_2px_rgb(var(--lr-700)/0.12)] ${className}`}>
      {box && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-full bg-lilac-500 shadow shadow-lilac-500/30"
          style={{ left: box.left, width: box.width, transition: settled.current ? `left 0.34s ${spring}, width 0.34s ${spring}` : 'none' }}
        />
      )}
      {options.map((o, i) => (
        <span key={o.id} className={`relative flex items-center ${fill ? 'min-w-0 flex-1 sm:flex-none' : 'shrink-0'}`}>
          {i > 0 && <span aria-hidden className={`h-3.5 w-px bg-ink-faint/25 transition-opacity duration-200 ${value === o.id || value === options[i - 1].id ? 'opacity-0' : ''}`} />}
          <button
            type="button"
            role="radio"
            aria-checked={value === o.id}
            ref={(el) => {
              if (el) refs.current.set(o.id, el)
            }}
            title={o.icon ? o.label : undefined}
            onClick={() => onChange(o.id)}
            className={`relative ${fill ? 'flex-1 px-1 sm:flex-none sm:px-2.5' : 'px-2.5'} whitespace-nowrap rounded-full py-1 text-xs transition-colors duration-200 ${value === o.id ? 'text-white' : 'text-ink-soft hover:text-ink'}`}
          >
            {o.icon ? (
              <span className={`flex items-center ${fill ? 'justify-center gap-0.5 sm:gap-1.5' : 'gap-1.5'}`}>
                {o.icon}
                <span className={iconsOnly ? 'sr-only sm:not-sr-only' : ''}>{o.label}</span>
              </span>
            ) : (
              o.label
            )}
          </button>
        </span>
      ))}
    </div>
  )
}
