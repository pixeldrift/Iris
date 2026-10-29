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
  const set = async (at: number | null, before: number | null = null) => {
    setReminder(task.id, at, before)
    if (at !== null) setPerm(await askNotify())
  }
  const rel = task.remindBefore != null ? (task.remindBefore === 0 ? 'the morning of' : task.remindBefore === 1 ? 'a day before' : task.remindBefore === 7 ? 'a week before' : `${task.remindBefore} days before`) : null
  const presets = reminderPresets(task, now)

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IconBell size={13} /> Remind me
      </span>
      {(task.remindAt !== null || rel) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-lilac-100/70 px-3 py-1.5 text-sm text-lilac-700">
          <span className="min-w-0 flex-1 truncate">
            {task.remindAt !== null ? formatReminder(task.remindAt, now) : `Remind ${rel} once it has a day`}
            {rel && task.remindAt !== null && <i className="ml-1.5 text-xs font-normal text-ink-faint">· {rel}</i>}
            {task.reminded && <i className="ml-1.5 text-xs font-normal text-ink-faint">· sent</i>}
          </span>
          <button onClick={() => set(null)} aria-label="Remove reminder" className="grid h-6 w-6 place-items-center rounded-full text-lilac-600 hover:bg-white/70">
            <IconClose size={12} />
          </button>
        </div>
      )}
      <SegmentedToggle
        label="Remind me"
        value={(task.remindBefore != null ? presets.find((p) => p.before === task.remindBefore) : presets.find((p) => p.at === task.remindAt && p.before === undefined))?.id ?? null}
        options={presets}
        onChange={(id) => {
          const p = presets.find((x) => x.id === id)
          if (!p) return
          const same = task.remindBefore != null ? p.before === task.remindBefore : p.at === task.remindAt
          return same ? set(null) : set(p.at, p.before ?? null)
        }}
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
          // clearing the time clears the reminder (an alert needs a time)
          onChange={(t) => (t ? set(at(task.remindAt !== null ? toISO(new Date(task.remindAt)) : toISO(new Date()), t)) : set(null))}
        />
      </div>
      {task.remindAt !== null && perm === 'denied' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">Notifications are blocked for Lilac, so you’ll only see this one while the app is open.</p>}
      {task.remindAt !== null && perm === 'unsupported' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">This browser can’t send notifications, so you’ll see it while the app is open.</p>}
    </div>
  )
}
