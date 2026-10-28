import { addDays, fromISO, ordinalSuffix, today, WEEKDAYS } from '../core/dates'
import { anchorOf, describeRecurrence, repeatOf, taskOnDate } from '../core/recurrence'
import { habitStreak } from '../core/tasks'
import type { Recurrence, Task } from '../core/types'
import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { DatePicker } from './DatePicker'
import { TimePicker } from './TimePicker'
import { IconBell, IconClose, IconPlus, IconRepeat } from './icons'
import { MenuItem, Popover } from './Popover'
import { askNotify } from './notify'
import { ALERT_CHOICES, alertLabel, nextAlertChoice } from '../core/reminders'

/** An event: the day, a start and end time, and where. */
export function EventFields({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DatePicker label="Date" value={task.day} onChange={(v) => update(task.id, { day: v })} />
        <span />
        <TimePicker label="Starts" value={task.time} onChange={(v) => update(task.id, { time: v })} />
        <TimePicker label="Ends" value={task.endTime} onChange={(v) => update(task.id, { endTime: v })} />
      </div>
      <label className="block text-xs font-medium text-ink-soft">
        Where
        <input
          value={task.place}
          onChange={(e) => update(task.id, { place: e.target.value })}
          placeholder="A place, a room, a link…"
          className="well mt-1 w-full rounded-xl px-3 py-2 text-sm font-normal text-ink placeholder:text-ink-faint"
        />
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
function EventAlerts({ task }: { task: Task }) {
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
  const pill = (on: boolean) => `rounded-full px-2.5 py-1 text-xs transition ${on ? 'bg-lilac-500 text-white' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IconRepeat size={13} /> Repeats
      </span>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.filter((f) => f.id !== 'none' || task.kind !== 'habit').map((f) => (
          <button key={f.id} type="button" onClick={() => choose(f.id)} aria-pressed={active === f.id} className={pill(active === f.id)}>
            {f.label}
          </button>
        ))}
      </div>
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
          <div className="flex gap-1.5" role="group" aria-label="Unit">
            {UNITS.map((u) => (
              <button key={u.id} type="button" onClick={() => unit(u.id)} aria-pressed={r.freq === u.id} className={`${pill(r.freq === u.id)} flex-1`}>
                {u.label}
              </button>
            ))}
          </div>
          {(r.freq === 'weekly' || (r.freq === 'monthly' && !!r.nth)) && (
            <div>
              {r.freq === 'monthly' && <div className="mb-1 text-xs text-ink-soft">On the</div>}
              {r.freq === 'monthly' && (
                <div className="mb-2 flex gap-1.5">
                  {NTHS.map((x) => (
                    <button key={x.n} type="button" onClick={() => set({ ...r, nth: x.n, byDay: [r.byDay?.[0] ?? anchorDow], custom: true })} aria-pressed={r.nth === x.n} className={`${pill(r.nth === x.n)} flex-1`}>
                      {x.label}
                    </button>
                  ))}
                </div>
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
            <div className="flex gap-1.5 text-xs">
              <button type="button" onClick={() => set({ ...r, nth: undefined, byDay: undefined, custom: true })} aria-pressed={!r.nth} className={`${pill(!r.nth)} flex-1`}>
                On the {fromISO(from).getDate()}
                {ordinalSuffix(fromISO(from).getDate())}
              </button>
              <button type="button" onClick={() => set({ ...r, nth: r.nth ?? Math.min(4, Math.ceil(fromISO(from).getDate() / 7)), byDay: [r.byDay?.[0] ?? anchorDow], custom: true })} aria-pressed={!!r.nth} className={`${pill(!!r.nth)} flex-1`}>
                On a weekday (e.g. 3rd Tue)
              </button>
            </div>
          )}
        </div>
      )}
      {r && (
        <p className="mt-2 text-xs text-lilac-700">
          {describeRecurrence({ ...r, from })}
          {habitStreak(task) > 0 && <span className="ml-2 text-ink-soft">· {habitStreak(task)} in a row</span>}
        </p>
      )}
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
