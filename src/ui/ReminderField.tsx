import { useState } from 'react'
import { toISO } from '../core/dates'
import { formatReminder, reminderPresets } from '../core/reminders'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { IconBell, IconClose } from './icons'
import { DatePicker } from './DatePicker'
import { askNotify, notifyState } from './notify'
import { SegmentedToggle } from './SegmentedToggle'
import { TimePicker } from './TimePicker'

const toHHMM = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`
const at = (day: string, hhmm: string) => {
  const [y, mo, d] = day.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

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
      <SegmentedToggle
        label="Remind me"
        value={presets.find((p) => p.at === task.remindAt)?.id ?? null}
        options={presets}
        onChange={(id) => set(task.remindAt === presets.find((p) => p.id === id)?.at ? null : (presets.find((p) => p.id === id)?.at ?? null))}
      />
      <div className="mt-2 grid grid-cols-2 gap-3">
        <DatePicker
          label="Or pick a day"
          value={task.remindAt !== null ? toISO(new Date(task.remindAt)) : null}
          onChange={(d) => (d ? set(at(d, task.remindAt !== null ? toHHMM(task.remindAt) : '09:00')) : set(null))}
        />
        <TimePicker
          label="and a time"
          value={task.remindAt !== null ? toHHMM(task.remindAt) : null}
          placeholder="Pick a time"
          onChange={(t) => (t ? set(at(task.remindAt !== null ? toISO(new Date(task.remindAt)) : toISO(new Date()), t)) : undefined)}
        />
      </div>
      {task.remindAt !== null && perm === 'denied' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">Notifications are blocked for Lilac, so you’ll only see this one while the app is open.</p>}
      {task.remindAt !== null && perm === 'unsupported' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">This browser can’t send notifications, so you’ll see it while the app is open.</p>}
    </div>
  )
}
