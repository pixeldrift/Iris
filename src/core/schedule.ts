import type { Task } from './types'

/** Minutes in a day, and how long an event with a start but no end is drawn. */
export const DAY_MIN = 1440
export const DEFAULT_MIN = 60

export const toMin = (s: string): number => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
export const hhmm = (min: number): string => {
  const c = Math.max(0, Math.min(DAY_MIN - 1, Math.round(min)))
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`
}

/** How long an event runs, if it has both a start and an end (the end is what is stored; duration is derived from it). */
export function durationOf(t: Pick<Task, 'time' | 'endTime'>): number | null {
  if (!t.time || !t.endTime) return null
  const d = toMin(t.endTime) - toMin(t.time)
  return d > 0 ? d : null
}

/** "1 hr 30 min", "45 min", "2 hr". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return [h ? `${h} hr` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ')
}

/** Moving the start keeps the duration: the end follows (an event with no end stays without one). */
export function patchStart(t: Pick<Task, 'time' | 'endTime'>, start: string | null): { time: string | null; endTime: string | null } {
  if (!start) return { time: null, endTime: t.endTime }
  const d = durationOf(t)
  if (d === null) return { time: start, endTime: t.endTime && toMin(t.endTime) > toMin(start) ? t.endTime : null }
  return { time: start, endTime: hhmm(Math.min(toMin(start) + d, DAY_MIN - 1)) }
}

/** Changing the duration moves the end (from the start, which must exist), never running past midnight. */
export function patchDuration(t: Pick<Task, 'time' | 'endTime'>, minutes: number | null): { endTime: string | null } {
  if (!t.time || minutes === null || minutes <= 0) return { endTime: null }
  return { endTime: hhmm(Math.min(toMin(t.time) + minutes, DAY_MIN - 1)) }
}

/** Where an event sits in its day, in minutes. An event with a start but no end is drawn for a default hour. */
export function spanOnDay(t: Pick<Task, 'kind' | 'time' | 'endTime'>): { s: number; e: number } | null {
  if (t.kind !== 'event' || !t.time) return null
  const s = toMin(t.time)
  const e = t.endTime && toMin(t.endTime) > s ? toMin(t.endTime) : Math.min(s + DEFAULT_MIN, DAY_MIN)
  return { s, e: Math.max(e, s + 5) }
}

/** Side-by-side columns for events that overlap: each gets a column and how many its cluster needs. */
export function columnsFor(spans: { s: number; e: number }[]): { col: number; cols: number }[] {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].s - spans[b].s || spans[b].e - spans[a].e)
  const out = spans.map(() => ({ col: 0, cols: 1 }))
  let cluster: number[] = []
  let clusterEnd = -1
  let ends: number[] = []
  const close = () => {
    for (const i of cluster) out[i].cols = ends.length
    cluster = []
    ends = []
  }
  for (const i of order) {
    if (cluster.length && spans[i].s >= clusterEnd) close()
    let c = ends.findIndex((e) => e <= spans[i].s)
    if (c < 0) c = ends.length
    ends[c] = spans[i].e
    out[i].col = c
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, spans[i].e)
  }
  close()
  return out
}

/** The free stretches between the first and last event of the day (at least `min` minutes long). */
export function freeGaps(spans: { s: number; e: number }[], min = 30): { s: number; e: number }[] {
  const sorted = [...spans].sort((a, b) => a.s - b.s)
  const out: { s: number; e: number }[] = []
  let end = sorted.length ? sorted[0].e : 0
  for (const sp of sorted.slice(1)) {
    if (sp.s - end >= min) out.push({ s: end, e: sp.s })
    end = Math.max(end, sp.e)
  }
  return out
}
