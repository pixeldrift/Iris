import { MONTHS } from './dates'

/**
 * A birthday is kept as `YYYY-MM-DD`, or as `--MM-DD` when the year isn't known or isn't wanted (the same shorthand
 * the vCard and ISO 8601 formats use).
 */
export const hasYear = (b: string) => !b.startsWith('--')

const daysIn = (m: number, y: number | null) => [31, y === null || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
const p2 = (n: number) => String(n).padStart(2, '0')

function make(m: number, d: number, y: number | null): string | undefined {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= daysIn(m, y))) return undefined
  if (y !== null && (y < 1900 || y > 2200)) return undefined
  return y === null ? `--${p2(m)}-${p2(d)}` : `${String(y).padStart(4, '0')}-${p2(m)}-${p2(d)}`
}

const monthOf = (w: string) => {
  const t = w.toLowerCase()
  const i = t.length >= 3 ? MONTHS.findIndex((m) => m.toLowerCase().startsWith(t) || (t === 'sept' && m === 'September')) : -1
  return i + 1
}

/** Two-digit years read as the most recent century that isn't in the future ("90" is 1990, "05" is 2005). */
const fullYear = (y: string, now: Date) => {
  if (y.length === 4) return Number(y)
  const yy = Number(y)
  const cur = now.getFullYear()
  const c2 = 2000 + yy
  return c2 <= cur ? c2 : 1900 + yy
}

/**
 * Read a birthday someone typed: "Mar 4", "March 4 1990", "4 March", "3/4", "3/4/1990", "1990-03-04", "--03-04".
 * The year is optional. Numbers are month-first unless `dayFirst` (see the Region setting), and a first number over 12
 * can only be a day. Returns the stored form, null for an empty box, or undefined when it can't be understood.
 */
export function parseBirthday(text: string, dayFirst = false, now = new Date()): string | null | undefined {
  const t = text.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!t) return null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return make(Number(m[2]), Number(m[3]), Number(m[1]))
  if ((m = t.match(/^--(\d{1,2})-(\d{1,2})$/))) return make(Number(m[1]), Number(m[2]), null)
  if ((m = t.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}|\d{2}))?$/))) {
    const a = Number(m[1])
    const b = Number(m[2])
    // month then day, unless the order says otherwise or the first number can only be a day
    let month = dayFirst ? b : a
    let day = dayFirst ? a : b
    if (month > 12 && day <= 12) [month, day] = [day, month]
    return make(month, day, m[3] ? fullYear(m[3], now) : null)
  }
  if ((m = t.match(/^([a-z]+)\.? (\d{1,2})(?: (\d{4}|\d{2}))?$/))) {
    const mo = monthOf(m[1])
    return mo ? make(mo, Number(m[2]), m[3] ? fullYear(m[3], now) : null) : undefined
  }
  if ((m = t.match(/^(\d{1,2}) ([a-z]+)\.?(?: (\d{4}|\d{2}))?$/))) {
    const mo = monthOf(m[2])
    return mo ? make(mo, Number(m[1]), m[3] ? fullYear(m[3], now) : null) : undefined
  }
  return undefined
}

export const birthdayParts = (b: string): { month: number; day: number; year: number | null } => {
  const [y, mo, d] = b.startsWith('--') ? [null, ...b.slice(2).split('-')] : b.split('-')
  return { month: Number(mo), day: Number(d), year: y === null ? null : Number(y) }
}
