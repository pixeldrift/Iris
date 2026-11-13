import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { Popover } from './Popover'

/**
 * A number you can type on a keypad: a button showing the number that opens a pad (digits, clear, backspace) under it. Nothing is
 * kept until Done (or tapping away), so a half-typed number is never taken for the real one.
 */
export function NumberField({ label, value, onChange, min = 0, max = 99999, className = '', autoOpen = false, onCommit }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; className?: string; autoOpen?: boolean; onCommit?: () => void }) {
  const [open, setOpen] = useState(autoOpen)
  useEffect(() => { if (autoOpen) setOpen(true) }, [autoOpen])
  const [typed, setTyped] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const show = open && typed !== '' ? typed : String(value)
  const commit = () => {
    if (typed !== '') onChange(Math.max(min, Math.min(max, Number(typed))))
    setOpen(false)
    setTyped('')
    onCommit?.()
  }
  const press = (d: string) => setTyped((t) => (t.length >= String(max).length ? t : t === '0' ? d : t + d))
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? commit() : (setTyped(''), setOpen(true)))}
        className={`${className || 'well grid h-9 min-w-[3.25rem] place-items-center rounded-xl px-2.5 text-base font-medium tabular-nums text-ink'}`}
      >
        {show}
      </button>
      <Popover open={open} onClose={commit} anchor={btn} className="w-56 p-2.5">
        <div role="group" aria-label={`${label} keypad`}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-xs font-medium text-ink-soft">{label}</span>
            <span className="font-display text-2xl tabular-nums text-ink" aria-live="polite">
              {typed === '' ? value : typed}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} className="h-11 rounded-xl bg-white/60 text-lg font-medium text-ink shadow-sm transition active:scale-95 hover:bg-white">
                {d}
              </button>
            ))}
            <button type="button" onClick={() => setTyped('0')} aria-label="Clear" className="h-11 rounded-xl bg-white/40 text-sm text-ink-soft transition active:scale-95 hover:bg-white/70">
              C
            </button>
            <button type="button" onClick={() => press('0')} className="h-11 rounded-xl bg-white/60 text-lg font-medium text-ink shadow-sm transition active:scale-95 hover:bg-white">
              0
            </button>
            <button type="button" onClick={() => setTyped((t) => (t.length > 1 ? t.slice(0, -1) : '0'))} aria-label="Backspace" className="grid h-11 place-items-center rounded-xl bg-white/40 text-ink-soft transition active:scale-95 hover:bg-white/70">
              <IconClose size={14} />
            </button>
          </div>
          <button type="button" onClick={commit} className="mt-2 w-full rounded-full bg-lilac-500 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
            Done
          </button>
        </div>
      </Popover>
    </>
  )
}
