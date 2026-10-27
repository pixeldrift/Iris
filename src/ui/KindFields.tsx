import { addDays, fromISO, today, WEEKDAYS } from '../core/dates'
import { anchorOf, describeRecurrence, repeatOf, taskOnDate } from '../core/recurrence'
import { habitStreak } from '../core/tasks'
import type { Recurrence, Task } from '../core/types'
import { useStore } from '../state/store'
import { DatePicker } from './DatePicker'
import { IconRepeat } from './icons'

/** An event: the day, a start and end time, and where. */
export function EventFields({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const time = (label: string, key: 'time' | 'endTime', min?: string | null) => (
    <label className="text-xs font-medium text-ink-soft">
      {label}
      <input
        type="time"
        value={task[key] ?? ''}
        min={min ?? undefined}
        onChange={(e) => update(task.id, { [key]: e.target.value || null })}
        className="well mt-1 w-full rounded-xl px-2.5 py-1.5 text-sm font-normal text-ink"
      />
    </label>
  )
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DatePicker label="Date" value={task.day} onChange={(v) => update(task.id, { day: v })} />
        <span />
        {time('Starts', 'time')}
        {time('Ends', 'endTime', task.time)}
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
    </div>
  )
}

const FREQS = [
  { id: 'none', label: 'Never' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
] as const
const UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const

/** "Repeats": any task can repeat; the pond shows one bubble and each occurrence is ticked off in turn. */
export function RepeatField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const r = repeatOf(task)
  const set = (next: Recurrence | null) => update(task.id, { repeat: next, ...(next ? { days: null } : {}) })
  const choose = (id: (typeof FREQS)[number]['id']) => {
    if (id === 'none') return set(null)
    const from = anchorOf(task) || today()
    set({ freq: id, interval: r?.interval ?? 1, from, ...(id === 'weekly' ? { byDay: r?.freq === 'weekly' ? r.byDay : [fromISO(from).getDay()] } : {}) })
  }
  const active = r?.freq ?? 'none'
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IconRepeat size={13} /> Repeats
      </span>
      <div className="flex flex-wrap gap-1.5">
        {FREQS.filter((f) => f.id !== 'none' || task.kind !== 'habit').map((f) => (
          <button
            key={f.id}
            onClick={() => choose(f.id)}
            aria-pressed={active === f.id}
            className={`rounded-full px-2.5 py-1 text-xs transition ${active === f.id ? 'bg-lilac-500 text-white' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {r && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            Every
            <button onClick={() => set({ ...r, interval: Math.max(1, r.interval - 1) })} aria-label="Fewer" className="grid h-7 w-7 place-items-center rounded-full bg-white/60 hover:bg-white">
              −
            </button>
            <span className="w-5 text-center tabular-nums text-ink">{r.interval}</span>
            <button onClick={() => set({ ...r, interval: Math.min(99, r.interval + 1) })} aria-label="More" className="grid h-7 w-7 place-items-center rounded-full bg-white/60 hover:bg-white">
              +
            </button>
            {UNIT[r.freq]}
            {r.interval === 1 ? '' : 's'}
          </div>
          {r.freq === 'weekly' && (
            <div className="flex gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => {
                const on = (r.byDay?.length ? r.byDay : [fromISO(r.from).getDay()]).includes(i)
                return (
                  <button
                    key={i}
                    aria-pressed={on}
                    aria-label={WEEKDAYS[i]}
                    onClick={() => {
                      const cur = r.byDay?.length ? r.byDay : [fromISO(r.from).getDay()]
                      const next = on ? cur.filter((d) => d !== i) : [...cur, i].sort()
                      if (next.length) set({ ...r, byDay: next })
                    }}
                    className={`grid h-8 flex-1 place-items-center rounded-full text-xs transition ${on ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-xs text-lilac-700">
            {describeRecurrence({ ...r, from: anchorOf(task) })}
            {habitStreak(task) > 0 && <span className="ml-2 text-ink-soft">· {habitStreak(task)} in a row</span>}
          </p>
        </div>
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
