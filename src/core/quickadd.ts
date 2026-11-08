import { addDays, fromISO, MONTHS, toISO } from './dates'
import { dayFirst, formatDate } from './locale'
import { fuzzyRank, fuzzyScore } from './fuzzy'
import { pathOf } from './folders'
import { describeRecurrence } from './recurrence'
import { remindFromRule } from './reminders'
import { formatTime } from './tasks'
import type { Folder, Person, Recurrence, TaskKind } from './types'

/** What a line of typed text means. Everything is optional: only what was understood is set. */
export interface QuickAdd {
  title: string
  kind?: TaskKind
  day?: string
  due?: string
  /** The time of day it is due, when one was typed with "due". */
  dueTime?: string
  time?: string
  endTime?: string
  remindAt?: number
  /** "a day before": days before the item's own date, with no clock time to think about. */
  remindBefore?: number
  repeat?: Recurrence
  folderIds: string[]
  personIds: string[]
  /** Short readable pieces for a live preview ("Thu, Oct 29", "3 pm", "Every week on Mon"). */
  /** Where it happens: "at Main St", "at home". */
  place?: string
  chips: string[]
  /** The #groups and @people found, in the order they were typed (their ids). */
  tagOrder: string[]
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
  const out: QuickAdd = { title: '', folderIds: [], personIds: [], chips: [], tagOrder: [] }
  const typed: { id: string; chip: string; at: number }[] = []
  const todayISO = toISO(now)
  let remindMode = false
  let dueMode = false

  // "idea: ...", "list: ..." etc
  let r = take(t, /^\s*(task|event|habit|list|idea|notion)\s*:\s*/i)
  if (r.m) {
    out.kind = (r.m[1].toLowerCase() === 'notion' ? 'idea' : r.m[1].toLowerCase()) as TaskKind
    t = ` ${r.rest.trim()} `
  }

  // #folder and @person (by name; "#school/bio" walks a path). One that names nothing is put back in the title, after the loop:
  // putting it back inside would only find it again, forever.
  const unknown: string[] = []
  for (;;) {
    r = take(t, /\s#([\w][\w/ -]*?)(?=\s(?:#|@)|\s*$|\s(?:on|at|by|due|every|tomorrow|today|yesterday|next|in)\b)/i)
    if (!r.m) break
    t = r.rest
    const q = r.m[1].trim().toLowerCase()
    const hit = ctx.folders.find((f) => pathOf(ctx.folders, f.id).map((x) => x.name).join('/').toLowerCase() === q || f.name.toLowerCase() === q) ?? ctx.folders.find((f) => fuzzyScore(q, f.name) >= 0.8)
    if (hit && !out.folderIds.includes(hit.id)) {
      out.folderIds.push(hit.id)
      typed.push({ id: hit.id, chip: `#${hit.name}`, at: input.toLowerCase().indexOf(r.m[0].trim().toLowerCase()) })
    } else if (!hit) unknown.push(r.m[0].trim()) // unknown: leave it in the title
  }
  for (;;) {
    r = take(t, /\s@([\w][\w' .-]*?)(?=\s(?:#|@)|\s*$|\s(?:on|at|by|due|every|tomorrow|today|yesterday|next|in)\b)/i)
    if (!r.m) break
    t = r.rest
    const q = r.m[1].trim().toLowerCase()
    const hit = ctx.people.find((p) => p.name.toLowerCase() === q) ?? ctx.people.find((p) => p.name.toLowerCase().split(' ')[0] === q) ?? ctx.people.find((p) => fuzzyScore(q, p.name) >= 0.8)
    if (hit && !out.personIds.includes(hit.id)) {
      out.personIds.push(hit.id)
      typed.push({ id: hit.id, chip: `@${hit.name.split(' ')[0]}`, at: input.toLowerCase().indexOf(r.m[0].trim().toLowerCase()) })
    } else if (!hit) unknown.push(r.m[0].trim())
  }
  // people from the address book named without an @: a capitalised whole name (or first name) in what is left of the line.
  // A first name shared by several people is only taken for a favourite (and only if just one of them is); the name stays in the title.
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pool = ctx.people.filter((p) => !p.isMe && !out.personIds.includes(p.id) && p.name.trim())
  const firstOf = (p: Person) => p.name.trim().split(/\s+/)[0]
  const found = (word: string) => {
    const m = new RegExp(`(^|[^\\w])(${esc(word)})(?![\\w])`, 'i').exec(` ${t} `)
    return m && /^\p{Lu}/u.test(m[2]) ? m[2] : null
  }
  const named: Person[] = []
  for (const p of [...pool].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.name.length - a.name.length)) {
    if (named.length >= 3 || out.personIds.includes(p.id)) continue
    const full = p.name.trim()
    if (full.includes(' ') && found(full)) {
      named.push(p)
      out.personIds.push(p.id)
      continue
    }
    const first = firstOf(p)
    if (first.length < 3 || !found(first)) continue
    const same = pool.filter((x) => firstOf(x).toLowerCase() === first.toLowerCase())
    const favs = same.filter((x) => x.favorite)
    if (same.length > 1 && !(favs.length === 1 && favs[0].id === p.id)) continue
    named.push(p)
    out.personIds.push(p.id)
  }
  for (const p of named) {
    const word = p.name.includes(' ') && found(p.name.trim()) ? p.name.trim() : firstOf(p)
    typed.push({ id: p.id, chip: `@${firstOf(p)}`, at: Math.max(0, input.indexOf(word)) })
  }

  // the tags go in the order they were typed, whichever kind they are
  typed.sort((a, b) => a.at - b.at)
  for (const x of typed) {
    out.chips.push(x.chip)
    out.tagOrder.push(x.id)
  }
  if (unknown.length) t += ` ${unknown.join(' ')}`

  // "remind me a day before" / "a week in advance": relative to the item's own date, so no time is asked for
  let before: number | null = null
  const WORDS: Record<string, number> = { a: 1, the: 1, one: 1, '1': 1, two: 2, '2': 2, three: 3, '3': 3 }
  r = take(t, /\s(?:remind me|alert me|notify me|reminder)(?:\s+to)?\s+(?:(a|the|one|1|two|2|three|3)\s+)?(day|week)s?\s+(?:before|in advance|ahead of time|ahead|earlier|prior)(?=\s|$)/i)
  if (!r.m) r = take(t, /\s(?:(a|the|one|1|two|2|three|3)\s+)?(day|week)s?\s+(?:in advance|ahead of time|ahead|earlier|prior)(?=\s|$)/i)
  if (r.m) {
    before = (WORDS[(r.m[1] ?? 'a').toLowerCase()] ?? 1) * (r.m[2].toLowerCase() === 'week' ? 7 : 1)
    t = r.rest
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
  r = take(t, /\s(?:(due|by|before|until)\s+)?(?:on\s+)?(today|tonight|tomorrow|tmrw|tmr|yesterday)\b/i)
  if (r.m) {
    dueMode = !!r.m[1]
    const w = r.m[2].toLowerCase()
    date = w === 'yesterday' ? addDays(todayISO, -1) : w === 'tomorrow' || w.startsWith('tm') ? addDays(todayISO, 1) : todayISO
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
    // month first by default (US); day first when the date style is set that way
    const [mm, dd] = dayFirst() ? [Number(r.m?.[3]), Number(r.m?.[2])] : [Number(r.m?.[2]), Number(r.m?.[3])]
    if (r.m && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      dueMode = !!r.m[1]
      let d = new Date(now.getFullYear(), mm - 1, dd)
      if (toISO(d) < todayISO) d = new Date(now.getFullYear() + 1, mm - 1, dd)
      date = toISO(d)
      t = r.rest
    }
  }

  // "remind me tomorrow evening": a part of the day stands for a sensible hour
  if (remindMode && !start) {
    r = take(t, /\s(?:in the\s+|this\s+)?(morning|afternoon|evening|tonight|noon|midday|night)\b/i)
    if (r.m) {
      start = { morning: '09:00', afternoon: '14:00', evening: '18:00', tonight: '20:00', night: '20:00', noon: '12:00', midday: '12:00' }[r.m[1].toLowerCase()]
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
    if (out.remindAt) out.chips.push(`Remind ${formatDate(day, { weekday: true })}${start ? ` · ${formatTime(start)}` : ''}`)
  } else {
    if (date) {
      // a date on its own is when it is due; with a time of day it is a time to be somewhere or do it (a day and a start)
      const asDue = dueMode || !start
      if (asDue) out.due = date
      else out.day = date
      out.chips.push(asDue ? `Due ${formatDate(date, { weekday: true })}${dueMode && start ? ` · ${formatTime(start)}` : ''}` : formatDate(date, { weekday: true }))
    }
    if (start && dueMode && date) {
      out.dueTime = start // "due friday 6pm": the deadline has a time; nothing is scheduled at it
    } else if (start) {
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

  if (before !== null && !remindMode) {
    out.remindBefore = before
    const at = remindFromRule({ day: out.day ?? null, due: out.due ?? null, time: out.time ?? null }, before, now.getTime())
    if (at) out.remindAt = at
    out.chips.push(`Remind ${before === 1 ? 'a day' : before === 7 ? 'a week' : `${before} days`} before`)
  }

  // "at Main St", "at Joe's Cafe", "at home": a trailing "at" that is not a time is a place. Only a name starting with a capital letter (as typed) or a
  // common place word counts, so "look at the budget" stays a title.
  if (!remindMode) {
    const left = (rest: string) => rest.replace(/\s+/g, ' ').trim()
    let pl = take(t, /\s+at\s+(?!\d)((?:[A-Z][\w'’&.-]*)(?:\s+(?:[A-Z][\w'’&.-]*|\d+[A-Za-z]?|the|of|and|&))*)\s*$/)
    if (!pl.m) pl = take(t, /\s+at\s+(home|work|school|campus|church|the (?:office|gym|park|store|library|doctor'?s?|dentist'?s?))\s*$/i)
    if (pl.m && left(pl.rest)) {
      out.place = pl.m[1].trim()
      out.chips.push(`At ${out.place}`)
      t = pl.rest
    }
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

/**
 * Autocorrect for tags: while a #group or @person is being typed at the end of the line, the existing ones it could be
 * (typos allowed), each with the text the line would become if it were taken.
 */
export function suggestTags(text: string, ctx: { folders: Folder[]; people: Person[] }): { label: string; text: string }[] {
  const at = Math.max(text.lastIndexOf('#'), text.lastIndexOf('@'))
  if (at < 0 || (at > 0 && !/\s/.test(text[at - 1]))) return []
  const mark = text[at]
  const token = text.slice(at + 1)
  const q = token.trim()
  if (!q || token.length > 28 || /[#@]/.test(token)) return []
  const before = text.slice(0, at)
  const make = (label: string, name: string) => ({ label, text: `${before}${mark}${name} ` })
  if (mark === '#') {
    const leaf = q.split('/').pop()!.trim()
    if (!leaf) return []
    return fuzzyRank(leaf, ctx.folders, (f) => f.name, 0.5)
      .filter((f) => f.name.toLowerCase() !== q.toLowerCase())
      .slice(0, 3)
      .map((f) => make(`#${f.name}`, f.name))
  }
  return fuzzyRank(q, ctx.people, (p) => p.name, 0.5)
    .filter((p) => p.name.toLowerCase() !== q.toLowerCase())
    .slice(0, 3)
    .map((p) => make(`@${p.name}`, p.name))
}
