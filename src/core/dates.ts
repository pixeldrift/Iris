// Dates are plain `YYYY-MM-DD` strings in local time: no timezone surprises.

export const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const today = (now = new Date()) => toISO(now)

export function addDays(s: string, n: number): string {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function diffDays(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime()
  return Math.round(ms / 86_400_000)
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 1 -> "st", 2 -> "nd", 3 -> "rd", 4 -> "th"… (11th, 12th, 13th included). */
export function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

export function weekdayName(s: string): string {
  return WEEKDAYS[fromISO(s).getDay()]
}

/** "Today", "Tomorrow", then weekday names, for the next 7 days. */
export function dayLabel(date: string, now = today()): string {
  const diff = diffDays(now, date)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return weekdayName(date)
}

export function shortDate(s: string): string {
  const d = fromISO(s)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

/** Friendly relative label for chips: "Thu", "Mar 4", "Yesterday"... */
export function relativeLabel(s: string, now = today()): string {
  const diff = diffDays(now, s)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return weekdayName(s).slice(0, 3)
  return shortDate(s)
}

export function startOfWeek(s: string): string {
  const d = fromISO(s)
  return addDays(s, -d.getDay())
}

/** The 6x7 grid of dates shown for a month. */
export function monthGrid(year: number, month: number): string[] {
  const first = toISO(new Date(year, month, 1))
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
