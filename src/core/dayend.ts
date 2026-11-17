import { today } from './dates'

/**
 * Night-owl grace: when a day counts as over. Someone still up at 1 a.m. is still in the same day, so until this hour (default 4 a.m.)
 * nothing dated for "yesterday" is late yet, and nothing is finished or listed as overdue behind their back.
 */
let hours = 4
export const setDayEnds = (h: number) => {
  hours = Math.max(0, Math.min(8, Math.round(h)))
}
export const dayEnds = () => hours

/** The date it still is for someone who has not been to sleep: before the day-end hour, still the day before. */
export function graceToday(at: Date = new Date()): string {
  const d = new Date(at)
  if (d.getHours() < hours) d.setDate(d.getDate() - 1)
  return today(d)
}
