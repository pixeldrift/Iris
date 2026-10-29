import { useEffect } from 'react'
import { redo, undo } from './state/history'
import { useStore } from './state/store'
import { audioRunning, pauseAudio, resumeAudio, unlock } from './audio/engine'
import { applyAudio } from './state/store'
import { Decor } from './ui/Decor'
import { DialogHost } from './ui/dialogs'
import { DragLayer } from './ui/dnd'
import { ContactPromptHost, PersonDialog } from './ui/PeopleDialogs'
import { AccountHost } from './ui/Account'
import { SettingsDialog } from './ui/SettingsDialog'
import { DangerHost } from './ui/DangerZone'
import { ReminderHost } from './ui/Reminders'
import { ToastHost } from './ui/Toast'
import { UpdateBubble } from './ui/UpdateBubble'
import { NewTask, openCompose } from './ui/NewTask'
import { Sidebar } from './ui/Sidebar'
import { TaskDetail } from './ui/TaskDetail'
import { TopBar } from './ui/TopBar'
import { Board } from './ui/views/Board'
import { CalendarView } from './ui/views/Calendar'
import { ListView } from './ui/views/ListView'
import { AddressBook } from './ui/views/AddressBook'
import { Pond } from './ui/views/Pond'
import { Priority } from './ui/views/Priority'
import { Timeline } from './ui/views/Timeline'

const VIEW = { pond: Pond, list: ListView, board: Board, priority: Priority, calendar: CalendarView, timeline: Timeline }

export default function App() {
  const view = useStore((s) => s.view)
  const hasDetail = useStore((s) => s.selectedId !== null)
  const contacts = useStore((s) => s.scope.type === 'contacts')
  const View = contacts ? AddressBook : VIEW[view]

  useEffect(() => {
    applyAudio(useStore.getState().settings)
    // Browsers only allow audio after a gesture, and iOS only counts a finished tap (touchend / click), not the touch starting.
    // So keep trying on every tap until audio is really running, and wake it again whenever the app comes back.
    const events = ['touchend', 'pointerup', 'click', 'keydown'] as const
    const off = () => events.forEach((e) => window.removeEventListener(e, first, true))
    function first() {
      unlock()
      if (audioRunning()) off()
    }
    events.forEach((e) => window.addEventListener(e, first, true))
    const back = () => (document.visibilityState === 'visible' ? resumeAudio() : pauseAudio())
    document.addEventListener('visibilitychange', back)
    window.addEventListener('pageshow', back)
    window.addEventListener('pagehide', pauseAudio)
    return () => {
      off()
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('pageshow', back)
      window.removeEventListener('pagehide', pauseAudio)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Unfinished tasks planned for earlier days move forward: now, on return to the app, and each minute.
  useEffect(() => {
    const run = () => useStore.getState().rollover()
    run()
    const iv = window.setInterval(run, 60_000)
    const vis = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  const fmtKey = useStore((s) => s.settings.dateFormat + s.settings.clockFormat)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.matches('input, textarea, select, [contenteditable]')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.dispatchEvent(new Event('lilac:search'))
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        openCompose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    // a different date or clock style re-draws everything that writes one
    <div key={fmtKey} className="relative flex h-full overflow-hidden">
      <Decor />
      <Sidebar />
      <main className={`relative z-10 flex min-w-0 flex-1 flex-col pl-[1.15rem] transition-[padding] duration-300 md:pl-0 ${hasDetail ? 'md:pr-[25.5rem]' : ''}`}>
        <TopBar onNew={() => openCompose()} />
        <div className="relative min-h-0 flex-1 px-3 pb-3 md:px-4 md:pb-4" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <View />
        </div>
      </main>
      <TaskDetail />
      <NewTask />
      <PersonDialog />
      <ContactPromptHost />
      <ReminderHost />
      <AccountHost />
      <SettingsDialog />
      <DangerHost />
      <DialogHost />
      <ToastHost />
      <UpdateBubble />
      <DragLayer />
    </div>
  )
}
