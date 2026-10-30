import { useRef, useState } from 'react'
import { addDays, fromISO, monthGrid, MONTHS, relativeLabel, toISO, today, WEEKDAYS } from '../core/dates'
import { IconChevron } from './icons'
import { Popover } from './Popover'
import { Wheel } from './TimePicker'

const YEAR0 = 1950
const YEARS = Array.from({ length: 150 }, (_, i) => String(YEAR0 + i))
const MONTH_ITEMS = MONTHS.map((m, i) => (
  <span key={m}>
    <span className="text-[0.7rem] opacity-60">{i + 1}</span> • {m}
  </span>
))

/** Styled date field: a button that opens a small calendar popover. */
export function DatePicker({
  label,
  value,
  onChange,
  max,
  min,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  max?: string | null
  min?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [jump, setJump] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [cursor, setCursor] = useState(() => fromISO(value ?? today()))
  const grid = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const t0 = today()

  return (
    <div className="block text-xs font-medium text-ink-soft">
      {label}
      <button
        ref={btn}
        type="button"
        onClick={() => {
          setCursor(fromISO(value ?? t0))
          setJump(false)
          setOpen((o) => !o)
        }}
        className="well mt-1 flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm font-normal text-ink"
      >
        <span className={value ? '' : 'text-ink-faint'}>{value ? relativeLabel(value) : 'No date'}</span>
        <span className="text-ink-faint">▾</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} className="w-72 p-3">
        <div className="mb-2 flex items-center">
          <button
            type="button"
            aria-expanded={jump}
            aria-label="Choose month and year"
            onClick={() => setJump((j) => !j)}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-base text-ink hover:bg-white/70"
          >
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            <span className="text-xs text-ink-faint">{jump ? '▴' : '▾'}</span>
          </button>
          {!jump && (
            <span className="ml-auto flex items-center">
              <button className="grid h-7 w-7 place-items-center rounded-full text-ink hover:bg-white/70" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <span className="grid rotate-180 place-items-center"><IconChevron size={16} /></span>
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-full text-ink hover:bg-white/70" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <IconChevron size={16} />
              </button>
            </span>
          )}
        </div>
        {jump ? (
          <div className="grid grid-cols-[3fr_2fr] gap-x-2">
            <Wheel items={MONTH_ITEMS} label="Month" selected={cursor.getMonth()} onPick={(i) => setCursor(new Date(cursor.getFullYear(), i, 1))} />
            <Wheel items={YEARS} label="Year" selected={cursor.getFullYear() - YEAR0} onPick={(i) => setCursor(new Date(YEAR0 + i, cursor.getMonth(), 1))} />
          </div>
        ) : (
        <div className="grid grid-cols-7 gap-0.5 text-center text-[0.65rem] text-ink-faint">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w[0]}</span>
          ))}
          {grid.map((d) => {
            const dim = fromISO(d).getMonth() !== cursor.getMonth()
            const off = (max && d > max) || (min && d < min)
            return (
              <button
                key={d}
                disabled={!!off}
                onClick={() => {
                  onChange(d)
                  setOpen(false)
                }}
                className={`grid h-8 place-items-center rounded-full text-xs tabular-nums transition ${
                  d === value ? 'bg-lilac-500 text-white shadow' : d === t0 ? 'bg-lilac-100 text-lilac-700' : 'text-ink hover:bg-lilac-100/80'
                } ${dim ? 'opacity-40' : ''} ${off ? 'pointer-events-none opacity-20' : ''}`}
              >
                {fromISO(d).getDate()}
              </button>
            )
          })}
        </div>
        )}
        <div className="mt-3 flex items-center gap-0.5 text-xs">
          <button type="button" className="rounded-full px-2 py-1.5 text-lilac-700 hover:bg-lilac-100/80" onClick={() => (onChange(t0), setOpen(false))}>
            Today
          </button>
          <button type="button" className="rounded-full px-2 py-1.5 text-lilac-700 hover:bg-lilac-100/80" onClick={() => (onChange(toISO(fromISO(addDays(t0, 1)))), setOpen(false))}>
            Tomorrow
          </button>
          {value && (
            <button type="button" className="ml-auto rounded-full px-2 py-1.5 text-ink-faint hover:bg-white/70 hover:text-ink" onClick={() => (onChange(null), setOpen(false))}>
              Clear
            </button>
          )}
          <button type="button" className={`${value ? '' : 'ml-auto '}rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600`} onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Popover>
    </div>
  )
}
