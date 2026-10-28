import { addDays, fromISO, MONTHS, toISO } from './dates'
import { fuzzyScore } from './fuzzy'
import { pathOf } from './folders'
import { describeRecurrence } from './recurrence'
import { formatTime } from './tasks'
import type { Folder, Person, Recurrence, TaskKind } from './types'

/** What a line of typed text means. Everything is optional: only what was understood is set. */
export interface QuickAdd {
  title: string
  kind?: TaskKind
  day?: string
  due?: string
  time?: string
  endTime?: string
  remindAt?: number
  repeat?: Recurrence
  folderIds: string[]
  personIds: string[]
  /** Short readable pieces for a live preview ("Thu, Oct 29", "3 pm", "Every week on Mon"). */
  chips: string[]
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DAY_RE = '(sun(?:day)?s?|mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?)'

const monthOf = (s: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase())
const weekdayOf = (s: string) => DAY_ABBR.indexOf(s.slice(0, 3).toLowerCase())
const hhmm = (h: number, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

/** Remove the first match of `re` from `text`; returns the match (or null) and the remaining text. */
function take(text: string, re: RegExp): { m: RegExpMatchArray | null; rest: string } {
  const m = text.match(re)
  if (!m || m.index === undefined) return { m: null, rest: text }
  return { m, rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ') }
}

function to24(h: number, ap: string | undefined, hadMinutes: boolean): number | null {
  if (ap) {
    if (h < 1 || h > 12) return null
    return (h % 12) + (ap.toLowerCase().startsWith('p') ? 12 : 0)
  }
  if (h > 23) return null
  if (h >= 13 || h === 0) return h
  // bare "at 3": afternoon for 1-6, morning for 7-11, noon for 12 (unless written 3:30 etc.)
  void hadMinutes
  return h <= 6 ? h + 12 : h
}

/** Read a line of text the way a person means it: dates, times, repeats, #folders, @people, reminders. */
export function parseQuickAdd(input: string, now: Date, ctx: { folders: Folder[]; people: Person[] }): QuickAdd {
  let t = ` ${input.trim()} `.replace(/\s+/g, ' ')
  const out: QuickAdd = { title: '', folderIds: [], personIds: [], chips: [] }
  const todayISO = toISO(now)
  let remindMode = false
  let dueMode = false

  // "idea: ...", "list: ..." etc
  let r = take(t, /^\s*(task|event|habit|list|idea)\s*:\s*/i)
  if (r.m) {
    out.kind = r.m[1].toLowerCase() as TaskKind
    t = ` ${r.rest.trim()} `
  }

  // #folder and @person (by name; "#school/bio" walks a path)
  for (;;) {
    r = take(t, /\s#([\w][\w/ -]*?)(?=\s(?:#|@)|\s*$|\s(?:on|at|by|due|every|tomorrow|today|next|in)\b)/i)
    if (!r.m) break
    t = r.rest
    const q = r.m[1].trim().toLowerCase()
    const hit = ctx.folders.find((f) => pathOf(ctx.folders, f.id).map((x) => x.name).join('/').toLowerCase() === q || f.name.toLowerCase() === q) ?? ctx.folders.find((f) => fuzzyScore(q, f.name) >= 0.8)
    if (hit && !out.folderIds.includes(hit.id)) {
      out.folderIds.push(hit.id)
      out.chips.push(`#${hit.name}`)
    } else if (!hit) t += ` ${r.m[0].trim()}` // unknown: leave it in the title
  }
  for (;;) {
    r = take(t, /\s@([\w][\w' .-]*?)(?=\s(?:#|@)|\s*$|\s(?:on|at|by|due|every|tomorrow|today|next|in)\b)/i)
    if (!r.m) break
    t = r.rest
    const q = r.m[1].trim().toLowerCase()
    const hit = ctx.people.find((p) => p.name.toLowerCase() === q) ?? ctx.people.find((p) => p.name.toLowerCase().split(' ')[0] === q) ?? ctx.people.find((p) => fuzzyScore(q, p.name) >= 0.8)
    if (hit && !out.personIds.includes(hit.id)) {
      out.personIds.push(hit.id)
      out.chips.push(`@${hit.name.split(' ')[0]}`)
    } else if (!hit) t += ` ${r.m[0].trim()}`
  }

  // "remind me (to) ..." / "alarm": what follows is when to nudge, not when it happens
  r = take(t, /\s(?:remind me|reminder|alarm)(?:\s+to)?\s/i)
  if (r.m) {
    remindMode = true
    t = r.rest
  }

  // repeats
  let rec: Recurrence | null = null
  const monthDay = (s: string) => {
    const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?/)
    return m ? Math.min(31, Number(m[1])) : undefined
  }
  r = take(t, /\severy\s+(?:month|monthly)\s+on\s+the\s+(\d{1,2}(?:st|nd|rd|th)?)\b/i)
  if (r.m) rec = { freq: 'monthly', interval: 1, monthDay: monthDay(r.m[1]), from: todayISO }
  if (!rec) {
    r = take(t, /\s(?:monthly|every month)(?:\s+on\s+the\s+(\d{1,2}(?:st|nd|rd|th)?))?\b/i)
    if (r.m) rec = { freq: 'monthly', interval: 1, monthDay: r.m[1] ? monthDay(r.m[1]) : undefined, from: todayISO }
  }
  if (!rec) {
    // every third tuesday, every last friday
    r = take(t, new RegExp(`\\severy\\s+(first|second|third|fourth|last|1st|2nd|3rd|4th)\\s+${DAY_RE}\\b`, 'i'))
    if (r.m) {
      const nth = ({ first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: -1 } as Record<string, number>)[r.m[1].toLowerCase()]
      rec = { freq: 'monthly', interval: 1, byDay: [weekdayOf(r.m[2])], nth, from: todayISO }
    }
  }
  if (!rec) {
    r = take(t, /\severy\s+weekdays?\b/i)
    if (r.m) rec = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5], from: todayISO }
  }
  if (!rec) {
    r = take(t, /\severy\s+weekends?\b/i)
    if (r.m) rec = { freq: 'weekly', interval: 1, byDay: [0, 6], from: todayISO }
  }
  if (!rec) {
    // every mon, every mon/wed/fri, every tuesday and thursday, mondays
    r = take(t, new RegExp(`\\severy\\s+(?:other\\s+)?(${DAY_RE}(?:\\s*(?:,|/|and|&)\\s*${DAY_RE})*)\\b`, 'i'))
    if (r.m) {
      const days = [...r.m[1].toLowerCase().matchAll(new RegExp(DAY_RE, 'g'))].map((x) => weekdayOf(x[0]))
      rec = { freq: 'weekly', interval: /every\s+other/i.test(r.m[0]) ? 2 : 1, byDay: [...new Set(days)].sort(), from: todayISO }
    }
  }
  if (!rec) {
    r = take(t, /\severy\s+(?:(other)|(\d+))?\s*(day|week|month|year)s?\b/i)
    if (r.m) {
      const n = r.m[1] ? 2 : r.m[2] ? Number(r.m[2]) : 1
      rec = { freq: ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' } as const)[r.m[3].toLowerCase() as 'day'], interval: n, from: todayISO }
    }
  }
  if (!rec) {
    r = take(t, /\s(daily|weekly|annually|yearly|nightly)\b/i)
    if (r.m) rec = { freq: ({ daily: 'daily', nightly: 'daily', weekly: 'weekly', annually: 'yearly', yearly: 'yearly' } as const)[r.m[1].toLowerCase() as 'daily'], interval: 1, from: todayISO }
  }
  if (rec) t = r.rest

  // time ranges and times: 3-4:30pm, 3pm to 5pm, 15:30, at 3, noon
  let start: string | undefined
  let end: string | undefined
  r = take(t, /\s(?:at\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$)/i)
  if (r.m && (r.m[3] || r.m[6] || r.m[2] || r.m[5])) {
    const ap2 = r.m[6] ?? r.m[3]
    const ap1 = r.m[3] ?? (r.m[6] && Number(r.m[1]) <= Number(r.m[4]) ? r.m[6] : undefined)
    const h1 = to24(Number(r.m[1]), ap1?.replace(/\./g, ''), !!r.m[2])
    const h2 = to24(Number(r.m[4]), ap2?.replace(/\./g, ''), !!r.m[5])
    if (h1 !== null && h2 !== null) {
      start = hhmm(h1, Number(r.m[2] ?? 0))
      end = hhmm(h2, Number(r.m[5] ?? 0))
      t = r.rest
    }
  }
  if (!start) {
    r = take(t, /\s(?:at\s+|@\s*)?(noon|midnight)\b/i)
    if (r.m) {
      start = r.m[1].toLowerCase() === 'noon' ? '12:00' : '00:00'
      t = r.rest
    }
  }
  if (!start) {
    r = take(t, /\s(?:at\s+|@\s*)?(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$)/i)
    if (r.m) {
      const h = to24(Number(r.m[1]), r.m[3]?.replace(/\./g, ''), true)
      if (h !== null && Number(r.m[2]) < 60) {
        start = hhmm(h, Number(r.m[2]))
        t = r.rest
      }
    }
  }
  if (!start) {
    r = take(t, /\s(?:at\s+|@\s*)?(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$)/i)
    if (r.m) {
      const h = to24(Number(r.m[1]), r.m[2].replace(/\./g, ''), false)
      if (h !== null) {
        start = hhmm(h)
        t = r.rest
      }
    }
  }
  if (!start) {
    r = take(t, /\sat\s+(\d{1,2})(?=\s|$)/i) // a bare "at 3"
    if (r.m) {
      const h = to24(Number(r.m[1]), undefined, false)
      if (h !== null) {
        start = hhmm(h)
        t = r.rest
      }
    }
  }

  // dates
  let date: string | undefined
  const nextWeekday = (wd: number, skipThisWeek: boolean) => {
    let d = addDays(todayISO, 1)
    while (fromISO(d).getDay() !== wd) d = addDays(d, 1)
    if (!skipThisWeek) return d
    // "next friday": that weekday in the week that starts on the coming Monday
    let mon = addDays(todayISO, 1)
    while (fromISO(mon).getDay() !== 1) mon = addDays(mon, 1)
    return addDays(mon, (wd + 6) % 7)
  }
  r = take(t, /\s(?:(due|by|before|until)\s+)?(?:on\s+)?(today|tonight|tomorrow|tmrw|tmr)\b/i)
  if (r.m) {
    dueMode = !!r.m[1]
    const w = r.m[2].toLowerCase()
    date = w === 'tomorrow' || w.startsWith('tm') ? addDays(todayISO, 1) : todayISO
    t = r.rest
  }
  if (!date) {
    r = take(t, /\s(?:(due|by|before|until)\s+)?in\s+(\d+|a|an|one|two|three)\s+(day|week|month)s?\b/i)
    if (r.m) {
      dueMode = !!r.m[1]
      const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[r.m[2].toLowerCase()] ?? Number(r.m[2])
      const unit = r.m[3].toLowerCase()
      if (unit === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth() + n, now.getDate())
        date = toISO(d)
      } else date = addDays(todayISO, unit === 'week' ? n * 7 : n)
      t = r.rest
    }
  }
  if (!date) {
    r = take(t, /\s(?:(due|by|before|until)\s+)?(?:on\s+)?next\s+week\b/i)
    if (r.m) {
      dueMode = !!r.m[1]
      date = nextWeekday(1, false)
      t = r.rest
    }
  }
  if (!date) {
    r = take(t, new RegExp(`\\s(?:(due|by|before|until)\\s+)?(?:on\\s+)?(?:(next|this)\\s+)?${DAY_RE}\\b`, 'i'))
    if (r.m && !rec) {
      dueMode = !!r.m[1]
      date = nextWeekday(weekdayOf(r.m[3]), r.m[2]?.toLowerCase() === 'next')
      t = r.rest
    } else if (r.m && rec) t = r.rest // "every friday" was already read as the repeat; a stray day name is dropped with it
  }
  if (!date) {
    r = take(t, /\s(?:(due|by|before|until)\s+)?(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/i)
    if (r.m) {
      dueMode = !!r.m[1]
      date = `${r.m[2]}-${r.m[3]}-${r.m[4]}`
      t = r.rest
    }
  }
  if (!date) {
    r = take(t, new RegExp(`\\s(?:(due|by|before|until)\\s+)?(?:on\\s+)?(?:${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE})\\b`, 'i'))
    if (r.m) {
      dueMode = !!r.m[1]
      const mon = monthOf((r.m[2] ?? r.m[5]) as string)
      const day = Number(r.m[3] ?? r.m[4])
      let d = new Date(now.getFullYear(), mon, day)
      if (toISO(d) < todayISO) d = new Date(now.getFullYear() + 1, mon, day)
      date = toISO(d)
      t = r.rest
    }
  }
  if (!date) {
    r = take(t, /\s(?:(due|by|before|until)\s+)?(?:on\s+)?(\d{1,2})\/(\d{1,2})\b(?!\/)/i)
    if (r.m && Number(r.m[2]) >= 1 && Number(r.m[2]) <= 12 && Number(r.m[3]) >= 1 && Number(r.m[3]) <= 31) {
      dueMode = !!r.m[1]
      let d = new Date(now.getFullYear(), Number(r.m[2]) - 1, Number(r.m[3]))
      if (toISO(d) < todayISO) d = new Date(now.getFullYear() + 1, Number(r.m[2]) - 1, Number(r.m[3]))
      date = toISO(d)
      t = r.rest
    }
  }

  // put it together
  if (remindMode) {
    const day = date ?? (start && start <= hhmm(now.getHours(), now.getMinutes()) ? addDays(todayISO, 1) : todayISO)
    const [h, m] = (start ?? '09:00').split(':').map(Number)
    const [y, mo, d] = day.split('-').map(Number)
    if (date || start) out.remindAt = new Date(y, mo - 1, d, h, m).getTime()
    out.kind = out.kind ?? 'task'
    if (out.remindAt) out.chips.push(`Remind ${fromISO(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${start ? ` · ${formatTime(start)}` : ''}`)
  } else {
    if (date) {
      if (dueMode) out.due = date
      else out.day = date
      out.chips.push(dueMode ? `Due ${fromISO(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : fromISO(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))
    }
    if (start) {
      out.time = start
      if (end) out.endTime = end
      out.chips.push(end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start))
      if (!out.kind) out.kind = 'event'
      if (!out.day && !rec) {
        out.day = start <= hhmm(now.getHours(), now.getMinutes()) ? addDays(todayISO, 1) : todayISO
      }
    }
  }
  if (rec) {
    rec.from = out.day ?? out.due ?? todayISO
    if (out.kind !== 'event' && !out.kind) out.kind = start ? 'event' : 'habit'
    if (start && !out.day) out.day = rec.from
    out.repeat = rec
    out.chips.push(describeRecurrence(rec))
  }

  out.title = t
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:to|on|at|by|for|due|from|every|the)\s+/i, '')
    .replace(/\s+(?:on|at|by|for|due|from|every|next|this|in|until|till|before|to|and|the)\s*$/i, '')
    .replace(/\s+(?:on|at|by|for|due|from|every|next|this|in|until|till|before|to|and|the)\s*$/i, '')
    .trim()
  void MONTHS
  void DAY_NAMES
  return out
}
