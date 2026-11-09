import { useEffect, useRef, useState } from 'react'
import { birthdayParts, hasYear, parseBirthday } from '../core/birthday'
import { dayFirst, formatBirthday } from '../core/locale'
import { CalendarPopover } from './DatePicker'
import { IconCalendar } from './icons'

const show = (v: string | null) => (v ? formatBirthday(v) : '')

/**
 * A birthday you can type ("Mar 4", "3/4/1990", "4 March") or pick from a calendar. The year is optional: leave it off
 * and only the day and month are kept.
 */
export function BirthdayField({ value, onChange, className = '' }: { value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const [text, setText] = useState(show(value))
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // the field follows the value when it is changed from outside (a connection filling it in, the calendar)
  useEffect(() => {
    setText(show(value))
    setBad(false)
  }, [value])

  const commit = () => {
    const parsed = parseBirthday(text, dayFirst())
    if (parsed === undefined) return setBad(true)
    setBad(false)
    onChange(parsed)
    setText(show(parsed))
  }
  // the calendar always shows a whole date: a birthday without a year is shown in this year
  const calendarValue = !value ? null : hasYear(value) ? value : `${new Date().getFullYear()}-${String(birthdayParts(value).month).padStart(2, '0')}-${String(birthdayParts(value).day).padStart(2, '0')}`

  return (
    <div ref={box} className={`relative ${className}`}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // Enter saves, with what was typed
          e.preventDefault()
          commit()
          const form = e.currentTarget.form
          window.setTimeout(() => form?.requestSubmit(), 0)
        }}
        placeholder="Birthday"
        aria-label="Birthday"
        aria-invalid={bad}
        title="Type a date like Mar 4 or 3/4/1990; the year is optional"
        className={`well w-full rounded-xl px-3 py-2 pr-9 text-sm ${bad ? 'ring-2 ring-danger/50' : ''}`}
      />
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Pick a birthday from the calendar" title="Pick from a calendar" className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-lilac-600">
        <IconCalendar size={15} />
      </button>
      {bad && <p role="alert" className="absolute left-1 top-full z-10 mt-0.5 text-[0.68rem] text-danger-ink">Try “Mar 4” or “3/4/1990”.</p>}
      <CalendarPopover
        open={open}
        onClose={() => setOpen(false)}
        anchor={box}
        value={calendarValue}
        onChange={(v) => {
          onChange(v)
          setText(show(v))
        }}
      />
    </div>
  )
}
