import { addDays, fromISO, ordinalSuffix, today, WEEKDAYS } from '../core/dates'
import { SegmentedToggle } from './SegmentedToggle'
import { anchorOf, describeRecurrence, nextOccurrence, repeatOf, taskOnDate } from '../core/recurrence'
import { formatDate } from '../core/locale'
import { habitStreak } from '../core/tasks'
import type { Recurrence, Task } from '../core/types'
import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { DatePicker } from './DatePicker'
import { DurationPicker, TimePicker } from './TimePicker'
import { OpenPlace } from './shared'
import { durationOf, gapAround, hhmm, patchDuration, patchStart, spanOnDay } from '../core/schedule'
import { IconBell, IconClose, IconPlus, IconRepeat } from './icons'
import { MenuItem, Popover } from './Popover'
import { askNotify } from './notify'
import { ALERT_CHOICES, alertLabel, nextAlertChoice } from '../core/reminders'

/** The day it is scheduled for, optionally with a start and end (or a duration): one fact told three ways. */
export function ScheduleFields({ task, dateLabel = 'Date' }: { task: Task; dateLabel?: React.ReactNode }) {
  const update = useStore((s) => s.updateTask)
  const tasks = useStore((s) => s.tasks)
  // the free room around this event on its day: out to the events either side of it
  const mine = spanOnDay(task)
  const gap = mine
    ? gapAround(
        tasks.filter((t) => t.id !== task.id && t.day === task.day && !t.repeat && t.status !== 'done').flatMap((t) => spanOnDay(t) ?? []),
        mine.s,
        mine.e,
      )
    : null
  const canFitStart = !!gap && gap.from < mine!.s
  const canFitEnd = !!gap && gap.to > mine!.e
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DatePicker label={dateLabel} value={task.day} onChange={(v) => update(task.id, { day: v })} />
        <span />
        {/* start, end and duration are one fact told three ways: moving the start carries the end along, and end and duration follow each other */}
        <TimePicker label="Starts" value={task.time} onChange={(v) => update(task.id, patchStart(task, v))} />
        <TimePicker label="Ends" value={task.endTime} onChange={(v) => update(task.id, { endTime: v })} />
        <DurationPicker label="Duration" value={durationOf(task)} disabled={!task.time} onChange={(m) => update(task.id, patchDuration(task, m))} />
        {task.time && (
          // stretch to the free time either side: out to the neighbouring events (or 8 am and 6 pm when nothing is nearer)
          <div className="col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canFitStart}
              onClick={() => update(task.id, { time: hhmm(gap!.from), endTime: task.endTime ?? hhmm(mine!.e) })}
              className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft transition enabled:hover:bg-lilac-100/80 disabled:opacity-40"
            >
              ⇤ Start as early as fits
            </button>
            <button
              type="button"
              disabled={!canFitEnd}
              onClick={() => update(task.id, { endTime: hhmm(gap!.to) })}
              className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft transition enabled:hover:bg-lilac-100/80 disabled:opacity-40"
            >
              End as late as fits ⇥
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** An event: the schedule, where, and its reminders. */
export function EventFields({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  return (
    <div className="space-y-3">
      <ScheduleFields task={task} />
      <label className="block text-xs font-medium text-ink-soft">
        Where
        <span className="mt-1 flex items-center gap-1.5">
          <input
            value={task.place}
            onChange={(e) => update(task.id, { place: e.target.value })}
            placeholder="A place, a room, a link…"
            className="well min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-normal text-ink placeholder:text-ink-faint"
          />
          <OpenPlace place={task.place} />
        </span>
      </label>
      <EventAlerts task={task} />
    </div>
  )
}

/** One reminder before an event: pick how long before from a small menu, or remove it. */
function AlertRow({ minutes, taken, onChange, onRemove }: { minutes: number; taken: number[]; onChange: (m: number) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const choices = [...new Set([...ALERT_CHOICES, minutes])].sort((a, b) => a - b)
  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="well flex min-w-0 flex-1 items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm font-normal text-ink"
      >
        <span className="truncate">{alertLabel(minutes)}</span>
        <span className="text-ink-faint">▾</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} className="w-56 p-1.5">
        <div role="listbox" aria-label="How long before">
          {choices.map((m) => (
            <MenuItem key={m} active={m === minutes} onClick={() => (onChange(m), setOpen(false))} trailing={taken.includes(m) && m !== minutes ? <span className="text-[0.65rem] text-ink-faint">added</span> : undefined}>
              {alertLabel(m)}
            </MenuItem>
          ))}
        </div>
      </Popover>
      <button type="button" onClick={onRemove} aria-label={`Remove reminder: ${alertLabel(minutes)}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-ink">
        <IconClose size={12} />
      </button>
    </div>
  )
}

/** Reminders before an event: as many as you like, each its own row. */
export function EventAlerts({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const alerts = task.alerts ?? []
  const set = (next: number[]) => update(task.id, { alerts: next, alertsDone: [] })
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IconBell size={13} /> Remind me
      </span>
      <div className="space-y-1.5">
        {alerts.map((m, i) => (
          <AlertRow key={i} minutes={m} taken={alerts} onChange={(nm) => set(alerts.map((x, j) => (j === i ? nm : x)))} onRemove={() => set(alerts.filter((_, j) => j !== i))} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const m = nextAlertChoice(alerts)
          set([...alerts, m])
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') void askNotify()
        }}
        className="mt-1.5 flex items-center gap-1.5 rounded-full bg-white/50 px-3 py-1 text-xs text-lilac-700 transition hover:bg-white/80"
      >
        <IconPlus size={12} /> {alerts.length ? 'Add another reminder' : 'Add a reminder'}
      </button>
      {alerts.length > 0 && !task.time && <p className="mt-1.5 text-[0.68rem] text-ink-faint">Give the event a start time and these will count back from it.</p>}
    </div>
  )
}

const PRESETS = [
  { id: 'none', label: 'Never' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
] as const
const UNITS = [
  { id: 'daily', one: 'day', label: 'Days' },
  { id: 'weekly', one: 'week', label: 'Weeks' },
  { id: 'monthly', one: 'month', label: 'Months' },
  { id: 'yearly', one: 'year', label: 'Years' },
] as const
const NTHS = [
  { n: 1, label: '1st' },
  { n: 2, label: '2nd' },
  { n: 3, label: '3rd' },
  { n: 4, label: '4th' },
  { n: -1, label: 'Last' },
]

/** A plain preset (every day / week / month / year) versus anything more particular, which opens the Custom controls. */
const isCustom = (r: Recurrence) => !!r.custom || r.interval > 1 || (r.freq === 'weekly' && (r.byDay?.length ?? 0) > 1) || !!r.nth

/** "Repeats": any task can repeat; the pond shows one bubble and each occurrence is ticked off in turn. */
export function RepeatField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const r = repeatOf(task)
  const set = (next: Recurrence | null) => update(task.id, { repeat: next, ...(next ? { days: null } : {}) })
  const from = anchorOf(task) || today()
  const anchorDow = fromISO(from).getDay()
  const active = !r ? 'none' : isCustom(r) ? 'custom' : r.freq

  const choose = (id: (typeof PRESETS)[number]['id']) => {
    if (id === 'none') return set(null)
    if (id === 'custom') return set({ freq: r?.freq ?? 'weekly', interval: r?.interval ?? 1, from, custom: true, ...(r?.byDay?.length ? { byDay: r.byDay } : r?.freq === 'weekly' || !r ? { byDay: [anchorDow] } : {}), ...(r?.nth ? { nth: r.nth } : {}), ...(r?.monthDay ? { monthDay: r.monthDay } : {}) })
    set({ freq: id, interval: 1, from, ...(id === 'weekly' ? { byDay: [anchorDow] } : {}) })
  }
  const toggleDay = (i: number) => {
    if (!r) return
    const cur = r.byDay?.length ? r.byDay : [anchorDow]
    const next = cur.includes(i) ? cur.filter((d) => d !== i) : [...cur, i].sort()
    if (next.length) set({ ...r, byDay: next })
  }
  const unit = (freq: Recurrence['freq']) => {
    if (!r) return
    const next: Recurrence = { ...r, freq, custom: true }
    if (freq === 'weekly') next.byDay = r.byDay?.length ? r.byDay : [anchorDow]
    if (freq !== 'monthly') delete next.nth
    if (freq === 'monthly' && r.nth && !next.byDay?.length) next.byDay = [anchorDow]
    set(next)
  }

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IconRepeat size={13} /> Repeats
      </span>
      <SegmentedToggle label="Repeats" value={active} options={PRESETS.filter((f) => f.id !== 'none' || task.kind !== 'habit')} onChange={choose} />
      {r && active === 'custom' && (
        <div className="mt-2.5 space-y-2.5 rounded-2xl bg-white/35 p-3">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            Every
            <button type="button" onClick={() => set({ ...r, interval: Math.max(1, r.interval - 1), custom: true })} aria-label="Fewer" className="grid h-7 w-7 place-items-center rounded-full bg-white/60 hover:bg-white">
              −
            </button>
            <span className="w-5 text-center tabular-nums text-ink">{r.interval}</span>
            <button type="button" onClick={() => set({ ...r, interval: Math.min(99, r.interval + 1), custom: true })} aria-label="More" className="grid h-7 w-7 place-items-center rounded-full bg-white/60 hover:bg-white">
              +
            </button>
          </div>
          <SegmentedToggle label="Unit" className="w-full [&>span]:flex-1 [&_button]:w-full" value={r.freq} options={UNITS} onChange={unit} />
          {(r.freq === 'weekly' || (r.freq === 'monthly' && !!r.nth)) && (
            <div>
              {r.freq === 'monthly' && <div className="mb-1 text-xs text-ink-soft">On the</div>}
              {r.freq === 'monthly' && (
                <SegmentedToggle label="Which" className="mb-2 w-full [&>span]:flex-1 [&_button]:w-full" value={String(r.nth ?? '')} options={NTHS.map((x) => ({ id: String(x.n), label: x.label }))} onChange={(v) => set({ ...r, nth: Number(v), byDay: [r.byDay?.[0] ?? anchorDow], custom: true })} />
              )}
              <div className="flex gap-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => {
                  const on = (r.byDay?.length ? r.byDay : [anchorDow]).includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAYS[i]}
                      onClick={() => (r.freq === 'monthly' ? set({ ...r, byDay: [i], custom: true }) : toggleDay(i))}
                      className={`grid h-8 flex-1 place-items-center rounded-full text-xs transition ${on ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {r.freq === 'monthly' && (
            <SegmentedToggle
              label="Which day"
              className="w-full [&>span]:flex-1 [&_button]:w-full"
              value={r.nth ? 'weekday' : 'date'}
              options={[
                { id: 'date', label: `On the ${fromISO(from).getDate()}${ordinalSuffix(fromISO(from).getDate())}` },
                { id: 'weekday', label: 'On a weekday (e.g. 3rd Tue)' },
              ]}
              onChange={(v) => set(v === 'date' ? { ...r, nth: undefined, byDay: undefined, custom: true } : { ...r, nth: r.nth ?? Math.min(4, Math.ceil(fromISO(from).getDate() / 7)), byDay: [r.byDay?.[0] ?? anchorDow], custom: true })}
            />
          )}
        </div>
      )}
      {r && <RepeatEnds r={{ ...r, from }} set={set} />}
      {r && (
        <p className="mt-2 text-xs text-lilac-700">
          {describeRecurrence({ ...r, from })}
          {habitStreak(task) > 0 && <span className="ml-2 text-ink-soft">· {habitStreak(task)} in a row</span>}
        </p>
      )}
    </div>
  )
}

/** When a repeat stops (never, on a date, after some number of times), and skipping a single day of it. */
function RepeatEnds({ r, set }: { r: Recurrence; set: (next: Recurrence | null) => void }) {
  const anchor = r.from
  const ends = r.until ? 'on' : r.count ? 'after' : 'never'
  const now = today()
  const next = nextOccurrence(r, now, anchor)
  const ended = !next
  const skipped = [...(r.skip ?? [])].sort()
  const setEnd = (v: string) => {
    const { until: _u, count: _c, ...rest } = r
    if (v === 'on') set({ ...rest, until: addDays(next ?? now, 28) })
    else if (v === 'after') set({ ...rest, count: 10 })
    else set(rest)
  }
  return (
    <div className="mt-2.5 space-y-2.5">
      <div>
        <span className="mb-1 block text-xs font-medium text-ink-soft">Ends</span>
        <SegmentedToggle
          label="Ends"
          value={ends}
          options={[
            { id: 'never', label: 'Never' },
            { id: 'on', label: 'On a date' },
            { id: 'after', label: 'After' },
          ]}
          onChange={setEnd}
        />
        {ends === 'on' && (
          <div className="mt-2">
            <DatePicker label="Last day" value={r.until ?? null} onChange={(v) => set({ ...r, until: v ?? undefined })} />
          </div>
        )}
        {ends === 'after' && (
          <div className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            <button type="button" onClick={() => set({ ...r, count: Math.max(1, (r.count ?? 10) - 1) })} aria-label="Fewer times" className="grid h-7 w-7 place-items-center rounded-full bg-white/60 hover:bg-white">
              −
            </button>
            <span className="min-w-[3.5rem] text-center tabular-nums text-ink">{r.count ?? 10} {(r.count ?? 10) === 1 ? 'time' : 'times'}</span>
            <button type="button" onClick={() => set({ ...r, count: Math.min(999, (r.count ?? 10) + 1) })} aria-label="More times" className="grid h-7 w-7 place-items-center rounded-full bg-white/60 hover:bg-white">
              +
            </button>
          </div>
        )}
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-ink-soft">Skip one</span>
        {ended ? (
          <p className="text-xs text-ink-faint">This repeat has ended.</p>
        ) : (
          <button
            type="button"
            onClick={() => set({ ...r, skip: [...skipped, next].sort() })}
            className="rounded-full bg-white/60 px-3 py-1.5 text-xs text-ink-soft transition hover:bg-white/90"
          >
            Skip {formatDate(next, { weekday: true })}
          </button>
        )}
        {skipped.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Skipped days">
            {skipped.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full bg-lilac-100/80 py-0.5 pl-2.5 pr-1 text-[0.7rem] text-lilac-700">
                Skipped {formatDate(d)}
                <button type="button" onClick={() => set({ ...r, skip: skipped.filter((x) => x !== d) })} aria-label={`Don't skip ${formatDate(d)}`} title="Put it back" className="grid h-4 w-4 place-items-center rounded-full text-lilac-500 hover:bg-white/80">
                  <IconClose size={9} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** The last week of a repeating task: tick or untick any day it was due. */
export function RecentStrip({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const now = today()
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6))
  const toggle = (d: string) => update(task.id, { log: task.log.includes(d) ? task.log.filter((x) => x !== d) : [...task.log, d].sort() })
  return (
    <div>
      <span className="text-xs font-medium text-ink-soft">The last week</span>
      <div className="mt-1.5 flex gap-1">
        {week.map((d) => {
          const done = task.log.includes(d)
          const scheduled = taskOnDate(task, d)
          const name = WEEKDAYS[new Date(d + 'T00:00').getDay()]
          return (
            <button
              key={d}
              onClick={() => toggle(d)}
              aria-pressed={done}
              aria-label={`${name}${d === now ? ' (today)' : ''}`}
              className={`grid h-9 flex-1 place-items-center rounded-full text-xs transition ${done ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : scheduled ? 'bg-white/60 text-ink-soft hover:bg-white/90' : 'bg-white/25 text-ink-faint'} ${d === now ? 'ring-1 ring-lilac-300' : ''}`}
            >
              {name[0]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
