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

/**
 * A reminder: a quiet "Remind me" line that opens into quick choices or an exact date and time. A task has two, one for the
 * day to do it (`which` "do") and one for its deadline ("due"), each with its own time. Clearing one removes just that alert.
 */
export function ReminderField({ task, which = 'do', label = 'Remind me' }: { task: Task; which?: 'do' | 'due'; label?: string }) {
  const setReminder = useStore((s) => s.setReminder)
  const [perm, setPerm] = useState(notifyState())
  const [open, setOpen] = useState(false)
  const now = Date.now()
  const due = which === 'due'
  const remindAt = due ? (task.dueRemindAt ?? null) : task.remindAt
  const remindBefore = due ? (task.dueRemindBefore ?? null) : (task.remindBefore ?? null)
  const reminded = due ? !!task.dueReminded : task.reminded
  const set = async (at: number | null, before: number | null = null) => {
    setReminder(task.id, at, before, which)
    if (at !== null) setPerm(await askNotify())
  }
  const rel = remindBefore != null ? (remindBefore === 0 ? 'the morning of' : remindBefore === 1 ? 'a day before' : remindBefore === 7 ? 'a week before' : `${remindBefore} days before`) : null
  const presets = reminderPresets(task, now, which)
  const has = remindAt !== null || !!rel

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={label}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1 text-left text-xs transition ${has ? 'bg-lilac-100/70 text-lilac-700' : 'text-ink-faint hover:bg-white/60 hover:text-ink-soft'}`}
        >
          <IconBell size={13} />
          <span className="min-w-0 flex-1 truncate">
            {has ? (remindAt !== null ? formatReminder(remindAt, now) : `${rel}, once it has a day`) : label}
            {has && reminded && <i className="ml-1.5 font-normal text-ink-faint">· sent</i>}
          </span>
        </button>
        {has && (
          <button onClick={() => set(null)} aria-label={`Remove ${label.toLowerCase()}`} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-lilac-600 hover:bg-white/70">
            <IconClose size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2">
          <SegmentedToggle
            label={label}
            value={(remindBefore != null ? presets.find((p) => p.before === remindBefore) : presets.find((p) => p.at === remindAt && p.before === undefined))?.id ?? null}
            options={presets}
            onChange={(id) => {
              const p = presets.find((x) => x.id === id)
              if (!p) return
              const same = remindBefore != null ? p.before === remindBefore : p.at === remindAt
              return same ? set(null) : set(p.at, p.before ?? null)
            }}
          />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <DatePicker
              label="Or pick a day"
              value={remindAt !== null ? toISO(new Date(remindAt)) : null}
              onChange={(d) => (d ? set(at(d, remindAt !== null ? toHHMM(remindAt) : '09:00')) : set(null))}
            />
            <TimePicker
              label="and a time"
              value={remindAt !== null ? toHHMM(remindAt) : null}
              // clearing the time clears the reminder (an alert needs a time)
              onChange={(t) => (t ? set(at(remindAt !== null ? toISO(new Date(remindAt)) : toISO(new Date()), t)) : set(null))}
            />
          </div>
          {remindAt !== null && perm === 'denied' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">Notifications are blocked for Lilac, so you’ll only see this one while the app is open.</p>}
          {remindAt !== null && perm === 'unsupported' && <p className="mt-1.5 text-[0.68rem] text-ink-faint">This browser can’t send notifications, so you’ll see it while the app is open.</p>}
        </div>
      )}
    </div>
  )
}
