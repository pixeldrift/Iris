import { addDays, today, WEEKDAYS } from '../core/dates'
import { habitDay, habitStreak } from '../core/tasks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { DatePicker } from './DatePicker'

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

/** A habit: how it is going, and the last week to tick or untick. */
export function HabitPanel({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const now = today()
  const streak = habitStreak(task)
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6))
  const toggle = (d: string) => update(task.id, { log: task.log.includes(d) ? task.log.filter((x) => x !== d) : [...task.log, d].sort() })
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink-soft">The last week</span>
        <span className="text-xs text-lilac-700">{streak > 0 ? `${streak}-day streak` : 'Start one today'}</span>
      </div>
      <div className="mt-1.5 flex gap-1">
        {week.map((d) => {
          const done = task.log.includes(d)
          const scheduled = habitDay(task, d)
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
