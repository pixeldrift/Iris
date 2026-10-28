import { suppressHistory } from '../state/history'
import { useEffect } from 'react'
import { create } from 'zustand'
import { chime } from '../audio/engine'
import { addDays, toISO } from '../core/dates'
import { anchorOf, nextOccurrence, repeatOf } from '../core/recurrence'
import { alertLabel, dueAlerts, dueReminders, eventStartsFor, formatReminder } from '../core/reminders'
import { useStore } from '../state/store'
import { IconBell, IconClose } from './icons'
import { showSystem } from './notify'

/** Cards on screen: which task, and what to say about it ("Starts in 1 hour"). */
const useAlerts = create<{ items: { id: string; note: string }[] }>(() => ({ items: [] }))
const dismiss = (id: string) => useAlerts.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }))
const note = (minutes: number) => (minutes <= 0 ? 'Starting now' : `Starts in ${alertLabel(minutes).replace(' before', '')}`)

/** Watches the clock: when a reminder comes due it chimes, shows a card, and posts a system notification. */
export function ReminderHost() {
  const tasks = useStore((s) => s.tasks)
  const items = useAlerts((s) => s.items)
  const select = useStore((s) => s.select)
  const setReminder = useStore((s) => s.setReminder)
  const toggleDone = useStore((s) => s.toggleDone)

  useEffect(() => {
    const check = () => {
      const st = useStore.getState()
      const now = Date.now()
      const due = dueReminders(st.tasks, now)
      const alerts = dueAlerts(st.tasks, now, (t) => eventStartsFor(t, now))
      if (!due.length && !alerts.length) return
      suppressHistory(() => useStore.setState((s) => ({
        tasks: s.tasks.map((t) => {
          let next = t
          if (due.some((d) => d.id === t.id)) {
            // a repeating task's alert comes round again: same time of day, next occurrence
            const r = repeatOf(t)
            const nextDay = r && t.remindAt !== null ? nextOccurrence(r, addDays(toISO(new Date(t.remindAt)), 1), anchorOf(t)) : null
            if (nextDay && t.remindAt !== null) {
              const at = new Date(t.remindAt)
              const [y, m, d] = nextDay.split('-').map(Number)
              next = { ...t, remindAt: new Date(y, m - 1, d, at.getHours(), at.getMinutes()).getTime(), reminded: false }
            } else next = { ...t, reminded: true }
          }
          const fired = alerts.filter((a) => a.task.id === t.id).map((a) => a.key)
          if (fired.length) {
            // remember what has gone off (and forget occurrences long past, so the list stays short)
            const keep = (next.alertsDone ?? []).filter((k) => now - Number(k.split(':')[0]) < 7 * 86_400_000)
            next = { ...next, alertsDone: [...keep, ...fired] }
          }
          return next
        }),
      })))
      const cards = [...due.map((t) => ({ id: t.id, note: formatReminder(t.remindAt!, now) })), ...alerts.map((a) => ({ id: a.task.id, note: note(a.minutes) }))]
      useAlerts.setState((s) => ({ items: [...s.items.filter((x) => !cards.some((c) => c.id === x.id)), ...cards] }))
      chime()
      for (const c of cards) void showSystem(c.id, st.tasks.find((t) => t.id === c.id)?.title || 'Reminder', c.note)
    }
    check()
    const timer = window.setInterval(check, 10_000)
    const wake = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    // tapping a system notification brings the app forward and opens the task
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open-task' && e.data.id) {
        select(e.data.id)
        dismiss(e.data.id)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [select])

  const shown = items.flatMap((i) => {
    const t = tasks.find((x) => x.id === i.id)
    return t ? [{ t, note: i.note }] : []
  })
  if (!shown.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[135] flex flex-col items-center gap-2 md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {shown.map(({ t, note: text }) => (
        <div key={t.id} role="alert" className="glass glass-strong pop-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-3xl p-3.5 shadow-xl shadow-lilac-500/20">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-100 text-lilac-600">
            <IconBell size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base leading-tight">{t.title || 'Untitled'}</p>
            <p className="text-xs text-ink-soft">{text}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => (select(t.id), dismiss(t.id))} className="rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30">
                Open
              </button>
              <button onClick={() => (setReminder(t.id, Date.now() + 10 * 60_000), dismiss(t.id))} className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft hover:bg-white">
                Snooze 10 min
              </button>
              <button onClick={() => (toggleDone(t.id), dismiss(t.id))} className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft hover:bg-white">
                {t.kind === 'habit' ? 'Done today' : 'Done'}
              </button>
            </div>
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink">
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
