import { effectiveUrgency } from '../core/tasks'
import type { Task } from '../core/types'
import { SegmentedToggle } from './SegmentedToggle'
import { ListEditor } from './ListEditor'
import { ReminderField } from './ReminderField'
import { EventAlerts, RecentStrip, RepeatField, ScheduleFields } from './KindFields'
import { formatTime } from '../core/tasks'
import { useEffect, useRef, useState } from 'react'
import { allLinks } from '../core/people'
import { useStore } from '../state/store'
import { useExit } from './anim'
import { DateMark, DatePicker } from './DatePicker'
import { TimePicker } from './TimePicker'
import { notionImageFrom } from './photo'
import { describeRecurrence } from '../core/recurrence'
import { relativeLabel } from '../core/dates'
import { assignTask, useShare } from '../sync/share'
import { askConfirm } from './dialogs'
import { IconCheck, IconChevron, IconClose, IconPencil, IconPlus, IconTrash } from './icons'
import { DoneButton, KindHint, KINDS, OpenPlace, STATUSES } from './shared'
import { TagInput } from './TagInput'
import { Tip } from './Tip'

function SoftSlider({ label, shown = label, compact = false, left, right, value, onChange, actual, actualNote }: { label: string; shown?: string; compact?: boolean; left: string; right: string; value: number; onChange: (v: number) => void; actual?: number; actualNote?: string }) {
  return (
    <label className="block" title={`${label}: ${left} … ${right}`}>
      <span className="mb-0.5 block truncate text-xs font-medium text-ink-soft">{shown}</span>
      <span className="relative block">
        <input type="range" min={0} max={1} step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className="soft" aria-label={label} />
        {/* a small dot under the slider where the value really in use sits, when it is not where the slider has been left */}
        {actual !== undefined && Math.abs(actual - value) > 0.02 && (
          <span
            role="img"
            aria-label={`In use: ${Math.round(actual * 100)} percent. ${actualNote ?? ''}`}
            title={`In use: ${Math.round(actual * 100)}%${actualNote ? ` (${actualNote})` : ''}`}
            data-actual
            className="absolute bottom-[-0.15rem] z-20 grid h-3.5 w-3.5 -translate-x-1/2 place-items-center"
            style={{ left: `calc(0.55rem + (100% - 1.1rem) * ${Math.min(1, Math.max(0, actual))})` }}
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-lilac-700" />
          </span>
        )}
      </span>
      {!compact && (
        <span className="-mt-1.5 flex justify-between text-[0.68rem] leading-none text-ink-faint">
          <span>{left}</span>
          <span>{right}</span>
        </span>
      )}
    </label>
  )
}

/** Where it is: a place, a room, a link (events keep theirs beside their times). */
function PlaceField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  return (
    <label className="block text-xs font-medium text-ink-soft">
      Where
      <span className="mt-1 flex items-center gap-1.5">
        <input value={task.place} onChange={(e) => update(task.id, { place: e.target.value })} placeholder="A place, a room, a link…" className="well min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-normal text-ink placeholder:text-ink-faint" />
        <OpenPlace place={task.place} />
      </span>
    </label>
  )
}

/**
 * The dates of a task, in two plain steps: the day you plan to do it, and its deadline. Each has a reminder of its own right
 * under it. The timeline start and what happens if the day passes live under "More", out of the way.
 */
/** In a shared group: who the task is given to (a member of the group), and they are told. */
function AssignField({ task }: { task: Task }) {
  const share = useShare((s) => s.shares.find((x) => x.workspaceId === task.workspaceId))
  const me = useShare((s) => s.me)
  const people = useStore((s) => s.people)
  if (!task.workspaceId || !share) return null
  const members = share.members.filter((m) => m.status === 'active')
  const others = members.filter((m) => m.userId !== me)
  // someone tagged on the task who is also a member of this group (their entry is linked to their account)
  const tagged = task.personIds.flatMap((id) => {
    const link = people.find((p) => p.id === id)?.link
    const m = link && others.find((x) => x.userId === link.userId)
    return m ? [m] : []
  })
  return (
    <div className="rounded-2xl bg-white/35 p-3 text-xs font-medium text-ink-soft">
      <label className="block">
        Assigned to
        <select
          aria-label="Assigned to"
          value={task.assigneeId && members.some((m) => m.userId === task.assigneeId) ? task.assigneeId : ''}
          disabled={share.role === 'viewer'}
          onChange={(e) => assignTask(task, e.target.value || undefined)}
          className="well mt-1 block w-full rounded-xl px-2.5 py-1.5 text-sm font-normal text-ink"
        >
          <option value="">Nobody</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === me ? 'Me' : m.name}
            </option>
          ))}
        </select>
      </label>
      {others.length === 0 && <p className="mt-1.5 font-normal text-ink-faint">Only you are in this group so far. Once someone joins (Group menu › Sharing › Invite) you can give them tasks.</p>}
      {!task.assigneeId && tagged.length > 0 && (
        <button type="button" onClick={() => assignTask(task, tagged[0].userId)} className="mt-1.5 rounded-full bg-lilac-100/80 px-3 py-1 font-normal text-lilac-700 transition hover:bg-lilac-200/80">
          {tagged[0].name} is tagged on this: assign it to them
        </button>
      )}
    </div>
  )
}

/** A line that folds open: for the things most people leave alone (repeats, a separate day to work on it). */
function Twirl({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-1.5 rounded-xl px-1 py-1 text-left text-xs font-medium text-ink-soft transition hover:text-ink">
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          <IconChevron size={13} />
        </span>
        <span>{title}</span>
        {summary && !open && <span className="min-w-0 flex-1 truncate text-right font-normal text-lilac-700">{summary}</span>}
      </button>
      {open && <div className="mt-1.5 space-y-2.5 rounded-2xl bg-white/35 p-3">{children}</div>}
    </div>
  )
}

/** When it is due (a day, and a time if it matters) and the reminder that comes with it. */
function DueField({ task }: { task: Task }) {
  const setDue = useStore((s) => s.setDue)
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <DatePicker label={<><DateMark kind="deadline" />Due</>} value={task.due} onChange={(v) => setDue(task.id, v)} />
        {task.due && (
          <div className="min-w-[7.5rem]">
            <TimePicker label="Time" value={task.dueTime ?? null} onChange={(v) => setDue(task.id, task.due, v)} placeholder="Any time" />
          </div>
        )}
      </div>
      <ReminderField task={task} which="due" label="Remind me" />
    </div>
  )
}

/**
 * A day to do it, apart from when it is due: optional, so it is folded away until wanted. Give it a start (and an end, or a duration) and
 * it is something at a set time, which is all an event is.
 */
function PlanField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const [open, setOpen] = useState(() => !!task.day || !!task.start || !task.rollover || task.kind === 'event')
  const summary = task.day ? `${relativeLabel(task.day)}${task.time ? ` · ${formatTime(task.time)}${task.endTime ? `–${formatTime(task.endTime)}` : ''}` : ''}` : undefined
  return (
    <Twirl title={task.kind === 'event' ? 'When' : 'Plan a day to work on it'} summary={summary} open={open} onToggle={() => setOpen((o) => !o)}>
      <p className="text-[0.7rem] text-ink-faint">
        <DateMark kind="deadline" />Due is when it has to be done. <DateMark kind="scheduled" />The day you plan to do it is separate, and can have a time too (or a start and end: an hour to work on it); it shows on the calendar then.
      </p>
      <ScheduleFields task={task} dateLabel={<><DateMark kind="scheduled" />Work on it on</>} />
      {task.time ? <EventAlerts task={task} /> : task.day ? <ReminderField task={task} which="do" label="Remind me that day" /> : null}
      <div className="grid grid-cols-2 gap-3">
        <DatePicker label="Timeline start" value={task.start} max={task.due} onChange={(v) => update(task.id, { start: v })} />
        <div className="text-xs font-medium text-ink-soft">
          If I don’t finish
          <button
            type="button"
            onClick={() => update(task.id, { rollover: !task.rollover })}
            aria-pressed={task.rollover}
            className="glass-soft mt-1 flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm font-normal text-ink"
          >
            {task.rollover ? 'Carry to next day' : 'Leave it here'}
            <span className={`relative h-4 w-7 shrink-0 rounded-full transition ${task.rollover ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${task.rollover ? 'left-[0.85rem]' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
      </div>
    </Twirl>
  )
}

/**
 * Something to do (or be at, or keep doing), in the order people reach for things: where it belongs, when it is due, the reminder, then the
 * rest. The type only decides which of these show (it is a layout, not a category): a list adds its entries, a habit leaves out the dates
 * and opens its repeats.
 */
function TaskLayout({ task, links }: { task: Task; links: { href: string; label: string; who: string }[] }) {
  const update = useStore((s) => s.updateTask)
  const setStatus = useStore((s) => s.setStatus)
  const habit = task.kind === 'habit'
  const [repeatOpen, setRepeatOpen] = useState(() => !!task.repeat || habit)
  return (
    <>
      <TagInput taskId={task.id} />
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full bg-lilac-100 px-3.5 py-1.5 text-sm text-lilac-700 shadow-sm transition hover:bg-lilac-200">
              {l.label} {l.who}
            </a>
          ))}
        </div>
      )}
      <AssignField task={task} />
      {task.kind === 'list' && <ListEditor task={task} />}
      {!habit && <DueField task={task} />}
      {!habit && <PlanField task={task} />}
      {task.kind !== 'list' && (
        <Twirl title="Repeats" summary={task.repeat ? describeRecurrence(task.repeat) : undefined} open={repeatOpen} onToggle={() => setRepeatOpen((o) => !o)}>
          {task.kind === 'task' && <p className="text-[0.7rem] text-ink-faint">For something you want to keep doing, a Habit is usually the better fit.</p>}
          <RepeatField task={task} />
          {(!!task.repeat || habit) && <RecentStrip task={task} />}
        </Twirl>
      )}
      {habit && <ReminderField task={task} />}
      <PlaceField task={task} />
      <textarea
        value={task.notes}
        onChange={(e) => update(task.id, { notes: e.target.value })}
        placeholder="Notes…"
        aria-label="Notes"
        rows={3}
        className="well w-full resize-none rounded-2xl px-3.5 py-2.5 text-sm"
      />
      {/* both sliders on one line: most people never touch them (the priority grid does the fine tuning) */}
      <div className="grid grid-cols-2 gap-4">
        <SoftSlider label="How much it matters" shown="Importance" compact left="a passing thought" right="super important" value={task.importance} onChange={(v) => update(task.id, { importance: v })} />
        <SoftSlider label="How urgent it is" shown="Urgency" compact left="whenever" right="right away!" value={task.urgency} onChange={(v) => update(task.id, { urgency: v })} actual={effectiveUrgency(task)} actualNote="raised by the deadline" />
      </div>
      {!habit && (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-soft">Stage</span>
          <div className="flex gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStatus(task.id, s.id)}
                title={s.hint}
                className={`flex-1 rounded-xl py-1.5 text-sm transition ${task.status === s.id ? 'bg-lilac-100 font-medium text-lilac-700 ring-1 ring-lilac-300' : 'bg-white/40 text-ink-soft hover:bg-white/70'}`}
              >
                {s.one}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** A notion: a scribble on the back of a napkin. Where it belongs, the words (a big box), a picture. Nothing else. */
function NotionFields({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const showToast = useStore((s) => s.showToast)
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <TagInput taskId={task.id} />
      <textarea
        value={task.notes}
        onChange={(e) => update(task.id, { notes: e.target.value })}
        placeholder="Jot it down: a thought, a link, something to remember…"
        aria-label="Notes"
        rows={9}
        className="well w-full resize-y rounded-2xl px-3.5 py-3 text-sm leading-relaxed"
      />
      {task.image ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/40">
          <img src={task.image} alt="" draggable={false} className="max-h-72 w-full object-contain" />
          <button type="button" onClick={() => update(task.id, { image: undefined })} aria-label="Remove the picture" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/85 text-ink-soft shadow transition hover:text-[#b04a6e]">
            <IconClose size={13} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="glass-soft flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm text-lilac-700 transition hover:bg-white/80">
          <IconPlus size={14} /> Add a picture
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose a picture"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            update(task.id, { image: await notionImageFrom(file) })
          } catch (err) {
            showToast((err as Error).message)
          }
        }}
      />
    </>
  )
}

/** Every editable field of a task, one under another. Used by the side panel and by the quick-add box. */
export function TaskFields({ task, withKind = true }: { task: Task; withKind?: boolean }) {
  const people = useStore((s) => s.people)
  const update = useStore((s) => s.updateTask)
  const linked = people.filter((p) => task.personIds.includes(p.id))
  const links = linked.flatMap((p) => allLinks(p).map((l) => ({ ...l, who: p.name.split(' ')[0] })))
  const kindToggle = withKind && (
    <div className="space-y-1.5">
      <SegmentedToggle label="Type" value={task.kind} options={KINDS} onChange={(k) => update(task.id, { kind: k })} />
      <KindHint kind={task.kind} className="px-0.5" />
    </div>
  )
  return (
    <>
      {kindToggle}
      {task.kind === 'idea' ? <NotionFields task={task} /> : <TaskLayout task={task} links={links} />}
    </>
  )
}

export function TaskDetail() {
  const id = useStore((s) => s.selectedId)
  const live = useStore((s) => s.tasks.find((t) => t.id === s.selectedId))
  const update = useStore((s) => s.updateTask)
  const del = useStore((s) => s.deleteTask)
  const select = useStore((s) => s.select)
  const checkContact = useStore((s) => s.checkContact)
  const titleRef = useRef<HTMLInputElement>(null)
  const [editingTitle, setEditingTitle] = useState(false)

  // keep the last task around so the panel can animate out
  const last = useRef(live)
  if (live) last.current = live
  const task = live ?? last.current
  const { mounted, closing } = useExit(!!id && !!live, 240)

  // "Saved" blinks whenever something about the task changes
  const sig = task ? JSON.stringify([task.title, task.notes, task.kind, task.items, task.listStyle, task.time, task.endTime, task.place, task.log, task.repeat, task.remindAt, task.status, task.importance, task.urgency, task.start, task.due, task.day, task.rollover, task.dueRemindAt, task.place, task.days, task.folderIds, task.personIds]) : ''
  const [savedTick, setSavedTick] = useState(0)
  const firstSig = useRef(sig)
  useEffect(() => {
    if (sig !== firstSig.current) setSavedTick((n) => n + 1)
    firstSig.current = sig
  }, [sig])
  useEffect(() => {
    firstSig.current = sig
    setSavedTick(0)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.getAttribute('aria-label') === 'Add tag')) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, select])

  // a fresh, still-unnamed item opens ready to type; an existing one opens as plain text
  useEffect(() => {
    const fresh = !!id && (live?.title === 'New task' || live?.title === '')
    setEditingTitle(fresh)
    if (fresh) requestAnimationFrame(() => titleRef.current?.select())
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!task || !mounted) return null


  return (
    <>
      <div className={`fixed inset-0 z-[60] bg-ink/10 transition-opacity md:hidden ${closing ? 'opacity-0' : 'opacity-100'}`} onClick={() => select(null)} />
      <section
        className={`glass glass-strong fixed inset-x-0 bottom-[var(--kb,0px)] pl-[var(--safe-l)] pr-[var(--safe-r)] md:px-0 z-[70] flex max-h-[min(88dvh,calc(100dvh-var(--kb,0px)-0.75rem))] flex-col transition-[bottom,max-height] duration-200 ease-out rounded-t-3xl md:inset-x-auto md:bottom-3 md:right-[max(0.75rem,var(--safe-r))] md:top-3 md:max-h-none md:w-[24rem] md:rounded-3xl ${
          closing ? 'slide-out-right' : 'slide-in-right'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Task details"
      >
        <header className="flex items-start gap-3 px-5 pb-2 pt-5">
          {/* stays level with the first line of the title when it wraps */}
          {task.kind !== 'idea' && (
            <span className="mt-[5px] shrink-0">
              <DoneButton task={task} size={26} />
            </span>
          )}
          {editingTitle ? (
            <input
              ref={titleRef}
              autoFocus
              value={task.title}
              onChange={(e) => update(task.id, { title: e.target.value })}
              onBlur={() => {
                checkContact(task.id)
                setEditingTitle(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.stopPropagation()
                  e.currentTarget.blur()
                }
              }}
              placeholder="What’s floating in your mind?"
              aria-label="Title"
              className="well min-w-0 flex-1 rounded-xl px-3 py-1.5 font-display text-xl placeholder:text-ink-faint"
            />
          ) : (
            // plain, easy-to-read text; tap it to edit
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              aria-label="Edit title"
              className={`group flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left font-display text-xl leading-snug transition hover:bg-white/40 ${task.title ? '' : 'text-ink-faint'}`}
            >
              <span className="min-w-0 break-words">{task.title || 'Untitled'}</span>
              <span className="shrink-0 text-ink-faint/70 transition group-hover:text-lilac-600">
                <IconPencil size={14} />
              </span>
            </button>
          )}
          <Tip label="Close">
            <button onClick={() => select(null)} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-ink">
              <IconClose size={16} />
            </button>
          </Tip>
        </header>

        <div className="scroll-soft min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-3 pt-2" style={{ paddingBottom: 'calc(0.75rem + var(--kb, 0px) * 0.5)' }}>
          <TaskFields task={task} />
        </div>

        <footer className="space-y-3 border-t border-white/60 px-5 pb-4 pt-3">
          
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (await askConfirm({ title: 'Delete this item?', message: `“${task.title || 'Untitled'}” will be deleted.`, confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true })) del(task.id)
              }}
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-faint transition hover:text-[#b04a6e]"
            >
              <IconTrash size={14} /> Delete
            </button>
            <span key={savedTick} className={`ml-auto flex items-center gap-1 text-xs text-lilac-600 ${savedTick ? 'saved-blink' : ''}`} aria-live="polite">
              <IconCheck size={13} /> Saved automatically
            </span>
            <button onClick={() => select(null)} className="rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
              Done
            </button>
          </div>
        </footer>
      </section>
    </>
  )
}
