/**
 * How dates, times and phone numbers are written. The app is US-first: month before day, 12-hour clock,
 * (555) 123-4567. The user can switch the date and clock style in settings; this module just holds the choice
 * so the pure formatting code (chips, reminders, the quick-add line) can read it without any React.
 */
import { MONTHS, WEEKDAYS } from './dates'

export type DateStyle = 'us' | 'us-numeric' | 'dmy' | 'iso'
export type ClockStyle = '12' | '24'

export const DATE_STYLES: { id: DateStyle; label: string; sample: string }[] = [
  { id: 'us', label: 'Oct 28', sample: 'Oct 28, 2026' },
  { id: 'us-numeric', label: '10/28/2026', sample: 'month / day / year' },
  { id: 'dmy', label: '28/10/2026', sample: 'day / month / year' },
  { id: 'iso', label: '2026-10-28', sample: 'year-month-day' },
]

const prefs: { date: DateStyle; clock: ClockStyle } = { date: 'us', clock: '12' }

export const setLocalePrefs = (p: Partial<typeof prefs>) => Object.assign(prefs, p)
export const getLocalePrefs = () => ({ ...prefs })

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const p2 = (n: number) => String(n).padStart(2, '0')

/** "Oct 28" (and the year when it isn't this one), or numeric in the chosen order. `weekday` adds "Wed". */
export function formatDate(iso: string, opts: { weekday?: boolean; now?: Date } = {}): string {
  const [y, m, d] = parts(iso)
  const dow = opts.weekday ? `${WEEKDAYS[new Date(y, m - 1, d).getDay()].slice(0, 3)}, ` : ''
  switch (prefs.date) {
    case 'us-numeric':
      return `${dow}${m}/${d}/${y}`
    case 'dmy':
      return `${dow}${d}/${m}/${y}`
    case 'iso':
      return `${dow}${y}-${p2(m)}-${p2(d)}`
    default:
      return `${dow}${MONTHS[m - 1].slice(0, 3)} ${d}${y === (opts.now ?? new Date()).getFullYear() ? '' : `, ${y}`}`
  }
}

/** Day before month? Used when reading "3/4" typed into the quick-add line. */
export const dayFirst = () => prefs.date === 'dmy'

/** 15:30 -> "3:30 pm" (or "15:30"). */
export function formatClock(h: number, m: number): string {
  if (prefs.clock === '24') return `${p2(h)}:${p2(m)}`
  return `${h % 12 === 0 ? 12 : h % 12}${m ? ':' + p2(m) : ''} ${h < 12 ? 'am' : 'pm'}`
}

/** The time zone this device is in (nothing to configure: it follows the device). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'
  } catch {
    return 'Unknown'
  }
}

/** US phone numbers: 5551234567 / 15551234567 -> (555) 123-4567; anything else is left as typed. */
export function formatPhone(raw: string): string {
  const s = raw.trim()
  if (!s || s.startsWith('+') && !s.startsWith('+1')) return raw
  let d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return raw
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
