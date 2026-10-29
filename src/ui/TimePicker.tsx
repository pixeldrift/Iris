import { useRef, useState } from 'react'
import { formatTime } from '../core/tasks'
import { Popover } from './Popover'
import { ScrollFade } from './ScrollFade'

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

/** Styled time field (our own, matching DatePicker): a button that opens hour, minute and am / pm choices. */
export function TimePicker({ label, value, onChange, placeholder = 'No time' }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [h24, m] = value ? value.split(':').map(Number) : [9, 0]
  const pm = h24 >= 12
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const set = (nh12: number, nm: number, npm: boolean) => onChange(`${String((nh12 % 12) + (npm ? 12 : 0)).padStart(2, '0')}:${String(nm).padStart(2, '0')}`)
  const pill = (on: boolean) => `grid h-8 place-items-center rounded-full text-sm tabular-nums transition ${on ? 'bg-lilac-500 text-white shadow' : 'text-ink hover:bg-lilac-100/80'}`

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
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} className="w-60 p-3">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          {/* tall lists fade toward the edge with more beyond it, and show the same little scroll arrow as elsewhere */}
          <div className="flex h-48 flex-col">
            <ScrollFade>
              <div role="listbox" aria-label="Hour" className="grid gap-0.5 py-2 pr-0.5">
                {HOURS.map((h) => (
                  <button key={h} type="button" role="option" aria-selected={!!value && h === h12} onClick={() => set(h, m, pm)} className={pill(!!value && h === h12)}>
                    {h}
                  </button>
                ))}
              </div>
            </ScrollFade>
          </div>
          <div className="flex h-48 flex-col">
            <ScrollFade>
              <div role="listbox" aria-label="Minute" className="grid gap-0.5 py-2 pr-0.5">
                {MINUTES.map((mm) => (
                  <button key={mm} type="button" role="option" aria-selected={!!value && mm === m} onClick={() => set(h12, mm, pm)} className={pill(!!value && mm === m)}>
                    {String(mm).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </ScrollFade>
          </div>
          <div className="grid content-start gap-1">
            {(['am', 'pm'] as const).map((ap) => (
              <button key={ap} type="button" aria-pressed={!!value && pm === (ap === 'pm')} onClick={() => set(h12, m, ap === 'pm')} className={`${pill(!!value && pm === (ap === 'pm'))} px-2.5 uppercase`}>
                {ap}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center">
          {value && (
            <button type="button" className="rounded-full px-3 py-1.5 text-sm text-ink-faint hover:bg-white/70 hover:text-ink" onClick={() => (onChange(null), setOpen(false))}>
              Clear
            </button>
          )}
          <button type="button" className="ml-auto rounded-full bg-lilac-500 px-5 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Popover>
    </div>
  )
}
