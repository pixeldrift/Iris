import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatTime } from '../core/tasks'
import { Popover } from './Popover'

const HOURS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const ROW = 34
const SHOWN = 5
const CYCLES = 9

/**
 * A list that loops for ever: it is laid out several times over and quietly re-centred whenever the scroll gets near
 * an end, so it never runs out. The chosen entry sits at the top, and picking one scrolls it up there.
 */
function Wheel({ items, selected, label, onPick, shown = SHOWN }: { items: string[]; selected: number | null; label: string; onPick: (i: number) => void; shown?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [topRow, setTopRow] = useState(0)
  const n = items.length
  const period = n * ROW
  // start in the middle cycle with the chosen entry (or the first) at the top
  useLayoutEffect(() => {
    const el = ref.current
    if (el) {
      el.scrollTop = (Math.floor(CYCLES / 2) * n + (selected ?? 0)) * ROW
      setTopRow(Math.round(el.scrollTop / ROW))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // when the value changes from outside, bring it to the top (the nearest copy)
  useEffect(() => {
    const el = ref.current
    if (!el || selected === null) return
    const base = Math.round(el.scrollTop / ROW)
    const cycle = Math.floor(base / n)
    el.scrollTo({ top: (cycle * n + selected) * ROW, behavior: 'smooth' })
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const recentre = () => {
    const el = ref.current
    if (!el) return
    if (el.scrollTop < period * 2) el.scrollTop += period * 3
    else if (el.scrollTop > period * (CYCLES - 3)) el.scrollTop -= period * 3
    setTopRow(Math.round(el.scrollTop / ROW))
  }
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={recentre}
      className="no-scrollbar snap-y snap-proximity overflow-y-auto overscroll-contain"
      style={{ height: ROW * shown, maskImage: 'linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)' }}
    >
      {Array.from({ length: n * CYCLES }, (_, k) => {
        const i = k % n
        // only one copy is lit: the first one at or below the top of the view
        const on = selected !== null && k === topRow + ((((selected - topRow) % n) + n) % n)
        return (
          <button
            key={k}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => {
              onPick(i)
              ref.current?.scrollTo({ top: k * ROW, behavior: 'smooth' })
            }}
            className={`grid w-full snap-start place-items-center rounded-full text-sm tabular-nums transition ${on ? 'bg-lilac-500 text-white shadow' : 'text-ink hover:bg-lilac-100/80'}`}
            style={{ height: ROW }}
          >
            {items[i]}
          </button>
        )
      })}
    </div>
  )
}

/** Styled time field (our own, matching DatePicker): a button that opens looping hour and minute lists with am / pm. */
export function TimePicker({ label, value, onChange, placeholder = '–None–' }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [h24, m] = value ? value.split(':').map(Number) : [9, 0]
  const pm = h24 >= 12
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const set = (nh12: number, nm: number, npm: boolean) => onChange(`${String((nh12 % 12) + (npm ? 12 : 0)).padStart(2, '0')}:${String(nm).padStart(2, '0')}`)

  return (
    <div className="block text-xs font-medium text-ink-soft">
      {label}
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="well mt-1 flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm font-normal text-ink"
      >
        <span className={value ? '' : 'text-ink-faint'}>{value ? formatTime(value) : placeholder}</span>
        <span className="text-ink-faint">▾</span>
      </button>
      {/* the box opens flush under the field, the same width */}
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} matchAnchor className="p-2.5">
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-start gap-x-1">
          <Wheel items={HOURS} label="Hour" selected={value ? HOURS.indexOf(String(h12)) : null} onPick={(i) => set(Number(HOURS[i]), m, pm)} />
          <span aria-hidden className="grid place-items-center text-base font-medium text-ink-soft" style={{ height: ROW }}>
            :
          </span>
          <Wheel items={MINUTES} label="Minute" selected={value ? MINUTES.indexOf(String(m).padStart(2, '0')) : null} onPick={(i) => set(h12, Number(MINUTES[i]), pm)} />
          {/* AM and PM loop like the numbers, so every highlighted choice sits in the same top row */}
          <div className="ml-1 w-11">
            <Wheel items={['AM', 'PM']} shown={2} label="AM or PM" selected={value ? (pm ? 1 : 0) : null} onPick={(i) => set(h12, m, i === 1)} />
          </div>
        </div>
        <div className="mt-2 flex items-center">
          {value && (
            <button type="button" className="rounded-full px-3 py-1.5 text-sm text-ink-faint hover:bg-white/70 hover:text-ink" onClick={() => (onChange(null), setOpen(false))}>
              Clear
            </button>
          )}
          <button type="button" className="ml-auto rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Popover>
    </div>
  )
}
