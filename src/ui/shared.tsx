import { useEffect, useRef, useState } from 'react'
import { tint } from '../core/color'
import { addDays, relativeLabel, today } from '../core/dates'
import { currentOccurrence, repeatOf } from '../core/recurrence'
import { formatTime, isOverdue, plannedDate, weightOf } from '../core/tasks'
import type { Task, TaskStatus } from '../core/types'
import { useStore } from '../state/store'
import { useBoardSlot } from './boardSlot'
import { useDnd, usePointerDrag } from './dnd'
import { IconCheck, IconCheckHint, IconLink, IconPin } from './icons'
import { isLink, mapsUrl } from '../core/place'
import { checkVars, useTaskHue } from './taskColor'
import { ExampleHint, useExampleIndex } from './ExampleHint'

/** `label` names a whole column; `one` names a single item's stage. */
export const STATUSES: { id: TaskStatus; label: string; one: string; hint: string }[] = [
  { id: 'todo', label: 'Seeds', one: 'Seed', hint: 'Waiting to be started' },
  { id: 'doing', label: 'Growing', one: 'Growing', hint: 'In motion' },
  { id: 'done', label: 'Bloomed', one: 'Bloomed', hint: 'Finished' },
]

/** The app-wide way to show "how many": the digits alone, in a small bubble (0 included). */
export function CountBubble({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`inline-grid h-[1.3rem] min-w-[1.3rem] shrink-0 place-items-center rounded-full bg-white/65 px-1.5 text-[0.68rem] font-medium tabular-nums leading-none text-ink-soft shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)] ${className}`}>
      {n}
    </span>
  )
}

export const KINDS = [
  { id: 'task', label: 'Task', hint: 'Task: something to get done.' },
  { id: 'event', label: 'Event', hint: 'Event: a specific occurrence with a time or place.' },
  { id: 'habit', label: 'Habit', hint: 'Habit: a repeating action with a goal of consistency.' },
  { id: 'list', label: 'List', hint: 'List: a set of things to check off, like groceries.' },
  { id: 'idea', label: 'Idea', hint: 'Idea: a loose thought to keep for later.' },
] as const

/** One light italic line saying what the chosen type is for. */
export function KindHint({ kind, className = '' }: { kind: string; className?: string }) {
  const hint = KINDS.find((k) => k.id === kind)?.hint
  return hint ? <p className={`text-xs font-light italic text-ink-soft/80 ${className}`}>{hint}</p> : null
}

export function DoneButton({ task, size = 22 }: { task: Task; size?: number }) {
  const hue = useTaskHue(task)
  const toggle = useStore((s) => s.toggleDone)
  const occ = repeatOf(task) ? (currentOccurrence(task, today()) ?? today()) : null
  const done = occ ? task.log.includes(occ) : task.status === 'done'
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        toggle(task.id)
      }}
      style={{ width: size, height: size, ...checkVars(hue) }}
      className={`well-circle group/check grid shrink-0 place-items-center rounded-full ${done ? 'is-on text-white' : 'text-[color:var(--chk-ring,var(--color-lilac-400))] hover:text-[color:var(--chk-ring,var(--color-lilac-400))]'}`}
      aria-label={occ ? (done ? 'Undo this one' : 'Done this one') : done ? 'Mark not done' : 'Mark done'}
      aria-pressed={done}
    >
      {done ? (
        <IconCheck size={size * 0.62} />
      ) : (
        // a faint dotted check as a hint; pointing at it firms it up
        <span className="relative grid place-items-center">
          <span className="opacity-55 transition-opacity group-hover/check:opacity-0">
            <IconCheckHint size={size * 0.62} />
          </span>
          <span className="absolute opacity-0 transition-opacity group-hover/check:opacity-70">
            <IconCheck size={size * 0.62} />
          </span>
        </span>
      )}
    </button>
  )
}

export function FolderChips({ task, max = 3 }: { task: Task; max?: number }) {
  const folders = useStore((s) => s.folders)
  const mine = task.folderIds.map((id) => folders.find((f) => f.id === id)).filter(Boolean)
  if (!mine.length) return null
  return (
    <>
      {mine.slice(0, max).map((f) => (
        <span
          key={f!.id}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] leading-none"
          style={{ background: `${tint(f!.hue, 70, 88, .85)}`, color: `${tint(f!.hue, 35, 32)}` }}
        >
          {f!.name}
        </span>
      ))}
      {mine.length > max && <span className="text-[0.7rem] text-ink-faint">+{mine.length - max}</span>}
    </>
  )
}

/** A small button next to the place that opens it: a map for a place, the page itself for a link. */
export function OpenPlace({ place }: { place: string }) {
  if (!place.trim()) return null
  const link = isLink(place)
  return (
    <a
      href={mapsUrl(place)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link ? 'Open the link' : 'Show on a map'}
      title={link ? 'Open the link' : 'Show on a map'}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-100 text-lilac-600 transition hover:bg-lilac-200"
    >
      {link ? <IconLink size={15} /> : <IconPin size={15} />}
    </a>
  )
}

/** A line between two items, in the colour of the drop marker in the sidebar: where the carried item would land. */
export function SlotLine({ at }: { at: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      data-slot-line
      className={`pointer-events-none absolute inset-x-0 z-10 h-[0.22rem] rounded-full bg-lilac-500 shadow-[0_0_8px_rgb(var(--lr-500)/0.55)] ${at === 'top' ? '-top-[0.31rem]' : '-bottom-[0.31rem]'}`}
    />
  )
}

/** Where the item is, as a small chip with a pin (nothing when it has no place). */
export function PlaceChip({ task }: { task: Task }) {
  if (!task.place.trim()) return null
  return (
    <span title={task.place} className="inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-white/55 px-2 py-0.5 text-[0.7rem] leading-none text-ink-soft">
      <IconPin size={10} />
      <span className="truncate">{task.place}</span>
    </span>
  )
}

export function DueChip({ task, compact = false }: { task: Task; compact?: boolean }) {
  const when = plannedDate(task)
  if (!when) return null
  if (when === today() && !isOverdue(task)) {
    // today needs no date: the time if there is one, otherwise just "Today"
    return <span className="inline-flex items-center whitespace-nowrap rounded-full bg-lilac-200/80 px-2 py-0.5 text-[0.7rem] leading-none text-lilac-700">{task.time ? formatTime(task.time) : 'Today'}</span>
  }
  const late = isOverdue(task)
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] leading-none ${
        late ? 'bg-rose-soft/80 text-[#9a4566]' : when === today() ? 'bg-lilac-200/80 text-lilac-700' : 'bg-white/60 text-ink-soft'
      }`}
    >
      {relativeLabel(when)}
      {/* tomorrow is just "Tomorrow"; the time only rides along for days further out */}
      {task.kind === 'event' && task.time && when !== addDays(today(), 1) && <i className="ml-1 font-normal not-italic">· {formatTime(task.time)}</i>}
      {!compact && task.day && task.due && task.due !== task.day && <i className="ml-1 font-normal opacity-70">· due {relativeLabel(task.due)}</i>}
    </span>
  )
}

/** A soft dot whose size hints at weight, with no number attached. */
export function WeightDot({ task }: { task: Task }) {
  const w = weightOf(task)
  const folders = useStore((st) => st.folders)
  const group = folders.find((f) => f.id === task.folderIds[0])
  const s = 6 + w * 10
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center" title="">
      <span
        className={`rounded-full ${group ? '' : 'bg-gradient-to-br from-lilac-200 to-lilac-500'}`}
        style={{ width: s, height: s, opacity: 0.55 + w * 0.45, ...(group ? { background: `linear-gradient(135deg, ${tint(group.hue, 62, 78)}, ${tint(group.hue, 50, 56)})` } : {}) }}
      />
    </span>
  )
}

/** Draggable task card/row used by list, board and calendar. */
export function useTaskDrag(task: Task, el: React.RefObject<HTMLElement | null>, onClick?: (e: PointerEvent) => void) {
  const select = useStore((s) => s.select)
  return usePointerDrag({
    payload: { type: 'task', id: task.id },
    label: task.title,
    lift: () => el.current,
    touchNeedsHandle: true,
    touchHold: true,
    onClick: (e) => (onClick ? onClick(e) : select(task.id)),
    onEnd: ({ target }) => {
      // dropped in a Progress column: where in it, if the column said (otherwise it goes to the top)
      const slot = useBoardSlot.getState()
      useBoardSlot.setState({ target: null, index: 0, ids: [] })
      if (target) useStore.getState().dropTask(task.id, target, slot.target === target ? { index: slot.index, ids: slot.ids } : undefined)
    },
  })
}

/** The dots of a grab handle, pressed into the surface (two columns of three); in a tinted item they take its colour. */
export function GripDots() {
  return (
    <span aria-hidden data-grip-dots className="grid grid-cols-2 gap-[3px]">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="emboss-dot" />
      ))}
    </span>
  )
}

export function GripHandle({ onPointerDown, label, compact = false }: { onPointerDown: (e: React.PointerEvent, handle: boolean) => void; label?: string; compact?: boolean }) {
  return (
    <span
      data-grip
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown(e, true)
      }}
      className={`grid ${compact ? 'h-5 w-5' : 'h-8 w-7'} shrink-0 cursor-grab touch-none place-items-center [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition [@media(hover:hover)]:group-hover:opacity-100`}
      title={label}
      aria-hidden
    >
      <GripDots />
    </span>
  )
}

export function Dim({ id, children }: { id: string; children: React.ReactNode }) {
  const dragging = useDnd((s) => s.drag?.payload.id === id)
  return <div className={dragging ? 'opacity-40' : ''}>{children}</div>
}

/** Inline “add a task…” input used by list and board columns. */
export function QuickAdd({
  placeholder = 'Add a task…',
  label = 'Add a task',
  onAdd,
  autoFocus,
  examples = false,
}: {
  placeholder?: string
  /** What this box is for, for people using a screen reader and for the typing bar on a sideways phone (the placeholder is only a hint). */
  label?: string
  onAdd: (title: string) => void
  autoFocus?: boolean
  /** Show the same cross-fading examples as the Add dialog instead of a plain placeholder. */
  examples?: boolean
}) {
  const [v, setV] = useState('')
  const hint = useExampleIndex(examples && !v)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim()) return
        onAdd(v.trim())
        setV('')
      }}
    >
      <div className="relative">
        <input
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={examples ? '' : placeholder}
          aria-label={label}
          data-proxy-commit
          className="well w-full rounded-2xl px-4 py-2.5 text-sm"
        />
        {examples && !v && <ExampleHint index={hint} className="left-4 right-3 text-sm" />}
      </div>
    </form>
  )
}

/** A contact's round picture: their portrait when they have one, otherwise their initial on their colour. */
export function Avatar({ person, size = 36, className = '' }: { person: Pick<import('../core/types').Person, 'name' | 'hue' | 'photo'>; size?: number; className?: string }) {
  if (person.photo) return <img src={person.photo} alt="" width={size} height={size} draggable={false} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-semibold ${className}`} style={{ width: size, height: size, fontSize: size * 0.4, background: tint(person.hue, 65, 86), color: tint(person.hue, 38, 32) }} aria-hidden>
      {person.name[0]?.toUpperCase()}
    </span>
  )
}
