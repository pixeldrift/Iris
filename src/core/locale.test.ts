import { afterEach, describe, expect, it } from 'vitest'
import { formatClock, formatDate, formatPhone, setLocalePrefs } from './locale'
import { parseQuickAdd } from './quickadd'

afterEach(() => setLocalePrefs({ date: 'us', clock: '12' }))

describe('locale', () => {
  it('writes US dates by default and follows the chosen style', () => {
    const now = new Date(2026, 9, 28)
    expect(formatDate('2026-11-08', { now })).toBe('Nov 8')
    expect(formatDate('2027-01-05', { now })).toBe('Jan 5, 2027')
    expect(formatDate('2026-11-08', { now, weekday: true })).toBe('Sun, Nov 8')
    setLocalePrefs({ date: 'us-numeric' })
    expect(formatDate('2026-11-08', { now })).toBe('11/8/2026')
    setLocalePrefs({ date: 'dmy' })
    expect(formatDate('2026-11-08', { now })).toBe('8/11/2026')
    setLocalePrefs({ date: 'iso' })
    expect(formatDate('2026-11-08', { now })).toBe('2026-11-08')
  })
  it('writes the clock in 12 or 24 hours', () => {
    expect(formatClock(15, 30)).toBe('3:30 pm')
    expect(formatClock(9, 0)).toBe('9 am')
    setLocalePrefs({ clock: '24' })
    expect(formatClock(15, 30)).toBe('15:30')
  })
  it('formats US phone numbers and leaves the rest alone', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567')
    expect(formatPhone('1-555-123-4567')).toBe('(555) 123-4567')
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(formatPhone('123')).toBe('123')
  })
  it('reads 3/4 as March 4 unless dates are day-first', () => {
    const now = new Date(2026, 0, 2)
    expect(parseQuickAdd('dentist 3/4', now, { folders: [], people: [] }).day).toBe('2026-03-04')
    setLocalePrefs({ date: 'dmy' })
    expect(parseQuickAdd('dentist 3/4', now, { folders: [], people: [] }).day).toBe('2026-04-03')
  })
})
