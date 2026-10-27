import { useState } from 'react'
import { formatReminder, fromLocalInput, reminderPresets, toLocalInput } from '../core/reminders'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { IconBell, IconClose } from './icons'
import { askNotify, notifyState } from './notify'

/** "Remind me": quick choices, or an exact date and time. Clearing it removes the alert. */
export function ReminderField({ task }: { task: Task }) {
  const setReminder = useStore((s) => s.setReminder)
  const [perm, setPerm] = useState(notifyState())
  const now = Date.now()
  const set = async (at: number | null) => {
    setReminder(task.id, at)
    if (at !== null) setPerm(await askNotify())
  }
  const presets = reminderPresets(task, now)

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IconBell size={13} /> Remind me
      </span>
      {task.remindAt !== null && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-lilac-100/70 px-3 py-1.5 text-sm text-lilac-700">
          <span className="min-w-0 flex-1 truncate">
            {formatReminder(task.remindAt, now)}
            {task.reminded && <i className="ml-1.5 text-xs font-normal text-ink-faint">· sent</i>}
          </span>
          <button onClick={() => set(null)} aria-label="Remove reminder" className="grid h-6 w-6 place-items-center rounded-full text-lilac-600 hover:bg-white/70">
            <IconClose size={12} />
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => set(p.at)}
            aria-pressed={task.remindAt === p.at}
            className={`rounded-full px-2.5 py-1 text-xs transition ${task.remindAt === p.at ? 'bg-lilac-500 text-white' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="mt-2 block text-xs font-medium text-ink-soft">
        Or pick a time
        <input
          type="datetime-local"
          value={task.remindAt !== null ? toLocalInput(task.remindAt) : ''}
          onChange={(e) => {
            const ms = fromLocalInput(e.target.value)
            if (ms !== null) set(ms)
          }}
          className="well mt-1 w-full rounded-xl px-2.5 py-1.5 text-sm font-normal text-ink"
        />
      </label>
      {task.remindAt !== null && perm === 'denied' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">Notifications are blocked for Lilac, so you’ll only see this one while the app is open.</p>}
      {task.remindAt !== null && perm === 'unsupported' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">This browser can’t send notifications, so you’ll see it while the app is open.</p>}
    </div>
  )
}
