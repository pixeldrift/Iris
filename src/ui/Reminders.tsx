import { suppressHistory } from '../state/history'
import { useEffect, useRef } from 'react'
import { alertSound } from '../audio/engine'
import { addDays, toISO } from '../core/dates'
import { anchorOf, nextOccurrence, repeatOf } from '../core/recurrence'
import { alertLabel, dueAlerts, dueReminders, eventStartsFor, formatReminder, remindersDue } from '../core/reminders'
import { useStore } from '../state/store'
import { IconBell, IconChevron, IconClose } from './icons'
import { dismissAlert as dismiss, openNotices, useAlerts } from './notices'
import { enablePush } from '../sync/push'
import { showSystem } from './notify'

const note = (minutes: number) => (minutes <= 0 ? 'Starting now' : `Starts in ${alertLabel(minutes).replace(' before', '')}`)

/** Watches the clock: when a reminder comes due it sounds an alert, shows a card, and posts a system notification. */
export function ReminderHost() {
  const tasks = useStore((s) => s.tasks)
  const items = useAlerts((s) => s.items)
  const select = useStore((s) => s.select)

  useEffect(() => {
    const check = () => {
      const st = useStore.getState()
      const now = Date.now()
      // a task open in the details panel is still being set up (a time half-chosen is not a time): its reminders wait for Done
      const ready = st.tasks.filter((t) => t.id !== st.selectedId)
      const due = dueReminders(ready, now)
      const alerts = dueAlerts(ready, now, (t) => eventStartsFor(t, now))
      if (!due.length && !alerts.length) return
      suppressHistory(() => useStore.setState((s) => ({
        tasks: s.tasks.map((t) => {
          let next = t
          const which = due.some((d) => d.id === t.id) ? remindersDue(t, now) : []
          // the deadline's reminder goes off once, on its own
          if (which.includes('due')) next = { ...next, dueReminded: true }
          if (which.includes('do')) {
            // a repeating task's alert comes round again: same time of day, next occurrence
            const r = repeatOf(t)
            const nextDay = r && t.remindAt !== null ? nextOccurrence(r, addDays(toISO(new Date(t.remindAt)), 1), anchorOf(t)) : null
            if (nextDay && t.remindAt !== null) {
              const at = new Date(t.remindAt)
              const [y, m, d] = nextDay.split('-').map(Number)
              next = { ...next, remindAt: new Date(y, m - 1, d, at.getHours(), at.getMinutes()).getTime(), reminded: false }
            } else next = { ...next, reminded: true }
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
      const cards = [
        ...due.map((t) => {
          const w = remindersDue(t, now)
          // (what kind of reminder it is, when it is the deadline's)
          return { id: t.id, note: w.includes('do') ? formatReminder(t.remindAt!, now) : `Deadline · ${formatReminder(t.dueRemindAt!, now)}` }
        }), ...alerts.map((a) => ({ id: a.task.id, note: note(a.minutes) }))]
      useAlerts.setState((s) => ({ items: [...s.items.filter((x) => !cards.some((c) => c.id === x.id)), ...cards] }))
      alertSound()
      for (const c of cards) void showSystem(c.id, st.tasks.find((t) => t.id === c.id)?.title || 'Reminder', c.note)
    }
    if (useStore.getState().settings.systemNotifications) void enablePush() // (keeps the server's copy of this device's push address fresh)
    check()
    const timer = window.setInterval(check, 10_000)
    const wake = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    // closing the panel registers what was set
    const unsub = useStore.subscribe((s, prev) => {
      if (prev.selectedId && s.selectedId !== prev.selectedId) check()
    })
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
      unsub()
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
  // one card at a time, however many went off while you were away; a badge says how many more wait in the notifications list
  const { t, note: text } = shown[0]
  const more = shown.length - 1
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[var(--z-alert)] flex flex-col items-center md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2" style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'var(--safe-l)', paddingRight: 'var(--safe-r)' }}>
      <div className="relative w-full max-w-sm">
        <ReminderCard key={t.id} id={t.id} title={t.title} text={text} habit={t.kind === 'habit'} />
        {more > 0 && (
          <button
            onClick={openNotices}
            aria-label={`${more} more ${more === 1 ? 'notification' : 'notifications'}`}
            className="pointer-events-auto absolute -bottom-2.5 right-4 z-10 flex items-center gap-0.5 rounded-full bg-lilac-500 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-white shadow-md shadow-lilac-500/40 transition hover:bg-lilac-600"
          >
            +{more} more
            <IconChevron size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

/** One reminder card. Drag it left to send it away (or use the close button). */
function ReminderCard({ id, title, text, habit }: { id: string; title: string; text: string; habit: boolean }) {
  const select = useStore((s) => s.select)
  const setReminder = useStore((s) => s.setReminder)
  const toggleDone = useStore((s) => s.toggleDone)
  const card = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; t: number; id: number; dx: number; on: boolean } | null>(null)
  const away = () => {
    const el = card.current
    if (!el) return dismiss(id)
    el.style.transition = 'transform 0.2s ease-in, opacity 0.2s'
    el.style.transform = 'translateX(-120%)'
    el.style.opacity = '0'
    window.setTimeout(() => dismiss(id), 190)
  }
  return (
    <div
      ref={card}
      role="alert"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, dx: 0, on: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        const el = card.current
        if (!d || !el) return
        const dx = e.clientX - d.x
        // a sideways pull only: a mostly-vertical movement is a scroll
        if (!d.on && (Math.abs(dx) < 8 || Math.abs(e.clientY - d.y) > Math.abs(dx))) return
        if (!d.on) {
          d.on = true
          el.setPointerCapture?.(e.pointerId)
        }
        d.dx = Math.min(0, dx) // left only
        el.style.transition = 'none'
        el.style.transform = `translateX(${d.dx}px)`
        el.style.opacity = String(Math.max(0.3, 1 + d.dx / 260))
      }}
      onPointerUp={(e) => {
        const d = drag.current
        const el = card.current
        drag.current = null
        if (!d?.on || !el) return
        const fast = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t) > 0.5
        if (d.dx < -80 || (fast && d.dx < -30)) return away()
        // not far enough: springs back
        el.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.35, 0.55, 1), opacity 0.2s'
        el.style.transform = ''
        el.style.opacity = ''
      }}
      onPointerCancel={() => {
        drag.current = null
        const el = card.current
        if (el) {
          el.style.transform = ''
          el.style.opacity = ''
        }
      }}
      className="glass glass-strong pop-in pointer-events-auto flex w-full items-start gap-3 rounded-3xl p-3.5 shadow-xl shadow-lilac-500/20"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-100 text-lilac-600">
        <IconBell size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base leading-tight">{title || 'Untitled'}</p>
        <p className="text-xs text-ink-soft">{text}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => (select(id), dismiss(id))} className="rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30">
            Open
          </button>
          <button onClick={() => (setReminder(id, Date.now() + 10 * 60_000), dismiss(id))} className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft hover:bg-white">
            Snooze 10 min
          </button>
          <button onClick={() => (toggleDone(id), dismiss(id))} className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft hover:bg-white">
            {habit ? 'Done today' : 'Done'}
          </button>
        </div>
      </div>
      <button onClick={() => dismiss(id)} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink">
        <IconClose size={13} />
      </button>
    </div>
  )
}
