import { useEffect, useRef, useState } from 'react'
import { tint } from '../core/color'
import { Flower } from './Flower'
import { bubbleHue } from './pond/hue'
import { today } from '../core/dates'
import { currentOccurrence, isDoneNow, repeatOf } from '../core/recurrence'
import { dueInfo, DUE_TONE_CLASS } from '../core/rowModel'
import type { Task, TaskStatus } from '../core/types'
import { useStore } from '../state/store'
import { useBoardSlot } from './boardSlot'
import { useDnd, usePointerDrag } from './dnd'
import { IconBell, IconCheck, IconCheckHint, IconImage, IconLink, IconPerson, IconPin, IconRepeat } from './icons'
import { hasProgress, progressOf } from '../core/progress'
import { habitStreak } from '../core/tasks'
import { isLink, mapsUrl } from '../core/place'
import { checkVars, useTaskHue } from './taskColor'
import { ExampleHint, useExampleIndex } from './ExampleHint'

/** `label` names a whole column; `one` names a single item's stage. */
export const STATUSES: { id: TaskStatus; label: string; one: string; hint: string }[] = [
  { id: 'todo', label: 'Not started', one: 'Not started', hint: 'Waiting to be started' },
  { id: 'doing', label: 'In progress', one: 'In progress', hint: 'In motion' },
  { id: 'done', label: 'Completed', one: 'Completed', hint: 'Finished' },
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
  { id: 'task', label: 'Task', hint: 'Something to get done.' },
  { id: 'event', label: 'Event', hint: 'Happens at a set time or place.' },
  { id: 'habit', label: 'Habit', hint: 'Repeats, aiming for consistency.' },
  { id: 'list', label: 'List', hint: 'Things to check off, like groceries.' },
  { id: 'idea', label: 'Idea', hint: 'A passing thought, link or scribble to keep for later. No dates, no fuss.' },
] as const

/** One or two light italic lines saying what the chosen type is for (always room for two, so the box never changes size as the type does). */
export function KindHint({ kind, className = '' }: { kind: string; className?: string }) {
  const hint = KINDS.find((k) => k.id === kind)?.hint
  return hint ? <p className={`min-h-8 text-xs font-light italic leading-4 text-ink-soft/80 ${className}`}>{hint}</p> : null
}

export function DoneButton({ task, size = 22 }: { task: Task; size?: number }) {
  const hue = useTaskHue(task)
  const toggle = useStore((s) => s.toggleDone)
  const occ = repeatOf(task) ? (currentOccurrence(task, today()) ?? today()) : null
  const done = isDoneNow(task)
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
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] leading-none"
          style={{ background: `${tint(f!.hue, 70, 88, .85)}`, color: `${tint(f!.hue, 35, 32)}`, borderColor: tint(f!.hue, 50, 66, 0.7) }}
        >
          {f!.name}
        </span>
      ))}
      {mine.length > max && <span className="text-[0.7rem] text-ink-faint">+{mine.length - max}</span>}
    </>
  )
}

/**
 * The little extras an item can carry, as small chips in the same family as the date chip (a 1px border, a soft tint): a reminder, a
 * repeat with its streak, how far along it is, a checklist count, who it is given to, a picture. Only what is set is shown, at most
 * `max` of them, the rest as "+N". Place and group have their own chips.
 */
export function ItemBadges({ task, max = 3, progress = true }: { task: Task; max?: number; /** Show progress as a chip (a view that draws it as a bar leaves it out). */ progress?: boolean }) {
  const people = useStore((s) => s.people)
  const out: { key: string; label: string; node: React.ReactNode }[] = []
  if ((task.remindAt !== null && !task.reminded) || (task.dueRemindAt != null && !task.dueReminded) || (task.alerts?.length ?? 0) > 0) out.push({ key: 'bell', label: 'Reminder set', node: <IconBell size={11} /> })
  const streak = habitStreak(task)
  if (task.repeat || task.kind === 'habit')
    out.push({ key: 'repeat', label: streak > 0 ? `Repeats, ${streak} in a row` : 'Repeats', node: <><IconRepeat size={11} />{streak > 0 && <span className="tabular-nums">{streak}</span>}</> })
  if (task.kind === 'list' && task.listStyle === 'check' && task.items.length > 0) out.push({ key: 'list', label: 'Checklist', node: <span className="tabular-nums">{task.items.filter((i) => i.done).length}/{task.items.length}</span> })
  else if (progress && hasProgress(task.kind) && task.status !== 'done' && progressOf(task) > 0) out.push({ key: 'progress', label: `${progressOf(task)}% done`, node: <span className="tabular-nums">{task.tally ? `${task.tally.done}/${task.tally.total}` : `${progressOf(task)}%`}</span> })
  const who = people.find((p) => task.personIds.includes(p.id))
  if (who) out.push({ key: 'person', label: `With ${who.name}`, node: <><IconPerson size={11} /><span className="max-w-[5rem] truncate">{who.name.split(' ')[0]}</span></> })
  if (task.image) out.push({ key: 'image', label: 'Has a picture', node: <IconImage size={11} /> })
  if (!out.length) return null
  const shown = out.slice(0, max)
  return (
    <>
      {shown.map((b) => (
        <span key={b.key} title={b.label} role="img" aria-label={b.label} className="inline-flex items-center gap-1 rounded-full border border-ink-faint/40 bg-white/55 px-1.5 py-0.5 text-[0.7rem] leading-none text-ink-soft">
          {b.node}
        </span>
      ))}
      {out.length > max && <span className="text-[0.7rem] text-ink-faint">+{out.length - max}</span>}
    </>
  )
}

/** How far along an item is, as a thin bar in the item's own colour (inside a `.tint` row, which sets the colour). Nothing at 0% or when done. */
export function ItemProgress({ task, className = '' }: { task: Task; className?: string }) {
  if (!hasProgress(task.kind) || isDoneNow(task)) return null
  const pct = progressOf(task)
  if (pct <= 0) return null
  return (
    <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress" title={`${pct}% done`} className={`block h-1 min-w-[4rem] overflow-hidden rounded-full border bg-white/60 ${className}`} style={{ borderColor: 'hsla(var(--h, 285), calc(50% * var(--s, 1)), 66%, 0.55)' }}>
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'hsl(var(--h, 285), calc(58% * var(--s, 1)), 60%)' }} />
    </span>
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
    <span title={task.place} className="inline-flex max-w-[10rem] items-center gap-1 rounded-full border border-ink-faint/40 bg-white/55 px-2 py-0.5 text-[0.7rem] leading-none text-ink-soft">
      <IconPin size={10} />
      <span className="truncate">{task.place}</span>
    </span>
  )
}

export function DueChip({ task, compact = false }: { task: Task; compact?: boolean }) {
  const d = dueInfo(task)
  if (!d) return null
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] leading-none ${DUE_TONE_CLASS[d.tone]}`}>
      {d.text}
      {d.time && <i className="ml-1 font-normal not-italic">· {d.time}</i>}
      {!compact && d.deadline && <i className="ml-1 font-normal opacity-70">· due {d.deadline}</i>}
    </span>
  )
}

/** The task's group as its small flower (the group's own colour and shape); a task in no group gets a plain blossom in its type's colour. */
export function TaskFlower({ task }: { task: Task }) {
  const folders = useStore((st) => st.folders)
  const group = folders.find((f) => f.id === task.folderIds[0])
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center" aria-hidden>
      <Flower hue={group ? group.hue : bubbleHue(task, folders)} shape={group?.shape ?? 'blossom'} size={16} />
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
  onType,
  below,
  listActions = false,
}: {
  placeholder?: string
  /** What this box is for, for people using a screen reader and for the typing bar on a sideways phone (the placeholder is only a hint). */
  label?: string
  onAdd: (title: string) => void
  autoFocus?: boolean
  /** Show the same cross-fading examples as the Add dialog instead of a plain placeholder. */
  examples?: boolean
  /** Told what is typed, as it is typed (to read it ahead of adding), and what to show under the box for it. */
  onType?: (text: string) => void
  below?: React.ReactNode
  /** Show explicit clear and submit controls in the List view quick-add. */
  listActions?: boolean
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
        onType?.('')
        // stay in the box, so a run of items can be typed one after another
        ref.current?.focus()
      }}
    >
      <div className="relative">
        <input
          ref={ref}
          value={v}
          onChange={(e) => {
            setV(e.target.value)
            onType?.(e.target.value)
          }}
          placeholder={examples ? '' : placeholder}
          aria-label={label}
          data-proxy-commit
          className={`well w-full rounded-2xl py-2.5 text-sm ${listActions ? (v ? "pl-4 pr-[5.5rem]" : "pl-4 pr-14") : "px-4"}`}
        />
        {examples && !v && <ExampleHint index={hint} className="left-4 right-3 text-sm" />}
        {listActions && (
          <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
            {v.length > 0 && (
              <button type="button" onClick={() => { setV(''); onType?.(''); ref.current?.focus() }} aria-label="Clear text" title="Clear" className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-ink">
                <span aria-hidden className="text-base leading-none">×</span>
              </button>
            )}
            <button type="submit" disabled={!v.trim()} aria-label="Add item" className="grid h-8 w-8 place-items-center rounded-xl bg-lilac-500 text-lg leading-none text-white shadow-sm shadow-lilac-500/25 transition hover:bg-lilac-600 disabled:cursor-default disabled:opacity-30">
              <span aria-hidden>↵</span>
            </button>
          </div>
        )}
      </div>
      {below}
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
