import { useEffect } from 'react'
import { redo, undo } from './state/history'
import { useStore } from './state/store'
import { unlock } from './audio/engine'
import { applyAudio } from './state/store'
import { Decor } from './ui/Decor'
import { DialogHost } from './ui/dialogs'
import { DragLayer } from './ui/dnd'
import { ContactPromptHost, PersonDialog } from './ui/PeopleDialogs'
import { AccountHost } from './ui/Account'
import { SettingsDialog } from './ui/SettingsDialog'
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
    // Browsers only allow audio after a gesture: resume ambient on the first one.
    const first = () => {
      unlock()
    }
    window.addEventListener('pointerdown', first, { once: true })
    return () => window.removeEventListener('pointerdown', first)
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
    <div className="relative flex h-full overflow-hidden">
      <Decor />
      <Sidebar />
      <main className={`relative z-10 flex min-w-0 flex-1 flex-col ${view === 'timeline' ? '' : 'pl-[1.15rem]'} transition-[padding] duration-300 md:pl-0 ${hasDetail ? 'md:pr-[25.5rem]' : ''}`}>
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
      <DialogHost />
      <ToastHost />
      <UpdateBubble />
      <DragLayer />
    </div>
  )
}
