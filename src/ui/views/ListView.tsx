import { useEffect, useMemo, useRef, useState } from 'react'
import { createFromLine, understandLine } from '../quickCreate'
import * as sound from '../../audio/engine'
import { useRowSwipe } from '../swipe'
import { isDoneNow } from '../../core/recurrence'
import { useFlip } from '../flip'
import { ScrollFade } from '../ScrollFade'
import { sortTasks, effectiveUrgency } from '../../core/tasks'
import type { SortKey, Task } from '../../core/types'
import { useStore } from '../../state/store'
import { Popover } from '../Popover'
import { IconCheck, IconTrash } from '../icons'
import { BatchEditor } from '../BatchEditor'
import { colorVars, useTaskHue } from '../taskColor'
import { rowKeys } from '../rowKeys'
import { EmptyState } from '../EmptyState'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { Dim, DoneButton, DueChip, FolderChips, PlaceChip, QuickAdd, SlotLine, TaskFlower, ItemBadges, ItemProgress, TallyIncrement, useTaskDrag } from '../shared'
import { useDropSlot } from '../dropSlot'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'flow', label: 'Priority' },
  { id: 'importance', label: 'Importance' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'due', label: 'Due date' },
  { id: 'created', label: 'Newest' },
  { id: 'title', label: 'A → Z' },
  { id: 'group', label: 'Group' },
  { id: 'manual', label: 'My order' },
]

function Row({ task, selected, selecting, onToggle, fresh = false }: { task: Task; selected: boolean; selecting: boolean; onToggle: () => void; /** Just added from the quick-add box: it glows for a moment. */ fresh?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const hue = useTaskHue(task)
  // Shift-click (or select mode) picks the item instead of opening it
  const onPointerDown = useTaskDrag(task, el, (e) => (e.shiftKey || selecting ? onToggle() : useStore.getState().select(task.id)))
  const del = useStore((s) => s.deleteTask)
  const toggleDone = useStore((s) => s.toggleDone)
  const done = isDoneNow(task)
  const swipe = useRowSwipe(wrap, done, () => del(task.id), () => toggleDone(task.id))
  const leave = useLeaveClass(task)
  return (
    <Dim id={task.id}>
      {/* a swipe (touch) pulls the row sideways over what is underneath: left, a trash can (delete); right, a check (and a line across the name) */}
      <div ref={wrap} data-done={done} className="swipe relative overflow-x-clip overflow-y-visible rounded-2xl">
        <div aria-hidden className="swipe-del absolute inset-0 rounded-2xl" />
        <div aria-hidden className="swipe-chk absolute inset-0 flex items-center justify-start rounded-2xl pl-5 text-white">
          <IconCheck size={18} />
        </div>
        <div
          ref={el}
          data-lift-id={`task:${task.id}`}
          data-flip={task.id}
          {...rowKeys(() => useStore.getState().select(task.id))}
          onPointerDown={(e) => {
            onPointerDown(e)
            swipe(e)
          }}
          style={{ touchAction: 'pan-y', ...colorVars(hue, effectiveUrgency(task)) }}
          className={`swipe-row tint lift-on-press group rise-in relative flex cursor-pointer outline-none ${fresh ? 'just-added' : ''} focus-visible:ring-2 focus-visible:ring-lilac-400 items-center gap-2.5 select-none rounded-2xl px-3 py-2.5 [-webkit-touch-callout:none] ${selected ? 'ring-2 ring-lilac-500' : ''} ${leave}`}
        >
          {(selecting || selected) && (
            <span aria-hidden className={`well-circle grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] leading-none text-white ${selected ? 'is-on' : ''}`}>
              {selected ? '✓' : ''}
            </span>
          )}
          <DoneButton task={task} />
          <TaskFlower task={task} />
          <span className="swipe-name min-w-0 flex-1">
            <span className="relative inline-block max-w-full align-top">
              <span className={`block truncate ${done ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</span>
              <span aria-hidden className="swipe-strike pointer-events-none absolute inset-x-0 top-1/2 -mt-px h-[2px] rounded-full" />
            </span>
          </span>
          {/* the chips, with how far along it is as a thin bar underneath them */}
          <div className="swipe-chips flex shrink-0 flex-col items-stretch gap-0.5">
            <div className="flex items-center justify-end gap-1">
              <span data-lift-extra className="hidden items-center gap-1 sm:flex">
                <ItemBadges task={task} progress={false} />
                <PlaceChip task={task} />
                <FolderChips task={task} max={2} />
              </span>
              <span data-lift-extra className="flex items-center">
                <DueChip task={task} compact />
                <TallyIncrement task={task} compact />
              </span>
              {(task.images?.[0] || task.image) && <img data-lift-extra src={task.images?.[0] || task.image} alt="" draggable={false} className="h-8 w-8 shrink-0 rounded-lg border border-white/70 object-cover shadow-sm" />}
            </div>
            <span data-lift-extra className="block empty:hidden">
              <ItemProgress task={task} />
            </span>
          </div>
          {/* with a mouse: a trash can that appears on hover (swiping is for touch) */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              del(task.id)
            }}
            aria-label="Delete"
            title="Delete"
            className="relative z-10 grid h-7 w-0 shrink-0 place-items-center overflow-hidden rounded-full bg-white/85 text-ink-faint opacity-0 shadow-sm transition-[width,opacity,margin] duration-200 hover:text-danger-deep md:group-hover:ml-1 md:group-hover:w-7 md:group-hover:opacity-100"
          >
            <IconTrash size={14} />
          </button>
        </div>
        {/* the trash can the swipe uncovers, with a lid that lifts as the row is pulled and shuts when it goes */}
        <span aria-hidden className="swipe-trash pointer-events-none absolute right-5 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center">
          <svg viewBox="-4 -5 32 34" width="32" height="34" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
            <path className="swipe-lid" d="M4 7h16 M9 7V4h6v3" />
            <path d="M10 11v6 M14 11v6 M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
          </svg>
        </span>
      </div>
    </Dim>
  )
}

export function ListView() {
  const visible = useVisibleTasks()
  const sortKey = useStore((s) => s.settings.sortKey)
  const sortDesc = useStore((s) => s.settings.sortDesc)
  const sortSecondaryKey = useStore((s) => s.settings.sortSecondaryKey)
  const set = useStore((s) => s.setSetting)
  const folders = useStore((s) => s.folders)

  const sorted = useMemo(() => sortTasks(visible, sortKey, sortDesc, folders, sortSecondaryKey), [visible, sortKey, sortDesc, folders, sortSecondaryKey])
  // Items added from the quick-add box stay at the top, in the order they were added, while more are being typed; a moment after the last
  // one, they glide to where the sort puts them (the list animates the move, so you can see where each went).
  const [fresh, setFresh] = useState<string[]>([])
  const freshTimer = useRef(0)
  const [announce, setAnnounce] = useState('')
  useEffect(() => () => window.clearTimeout(freshTimer.current), [])
  const rows = useMemo(() => {
    const here = fresh.map((id) => sorted.find((t) => t.id === id)).filter((t): t is Task => !!t)
    if (!here.length) return sorted
    const set = new Set(here.map((t) => t.id))
    return [...here, ...sorted.filter((t) => !set.has(t.id))]
  }, [sorted, fresh])
  const justAdded = useMemo(() => new Set(fresh), [fresh])
  // the quick-add box reads what is typed the way the New dialog does: dates, times, repeats, #groups, @people, places, reminders
  const qaMode = useStore((s) => s.settings.quickAdd)
  const people = useStore((s) => s.people)
  const [line, setLine] = useState('')
  const [accepted, setAccepted] = useState(false) // "suggest" mode: the suggestion was taken
  const [plain, setPlain] = useState(false) // "keep as typed" for this line
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const understood = useMemo(() => (plain ? null : understandLine(line)), [line, plain, qaMode, folders, people])
  const understoodChips = understood && understood.chips.length > 0 ? understood.chips : null
  const applying = qaMode === 'auto' ? !plain : qaMode === 'suggest' ? accepted : false
  const quickAdd = (title: string) => {
    const id = createFromLine(title, applying)
    sound.drop()
    setAccepted(false)
    setPlain(false)
    setLine('')
    setFresh((f) => [id, ...f])
    setAnnounce(`Added ${title}`)
    window.clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh([]), 2200)
    // (the new row is at the top: bring the top into view)
    requestAnimationFrame(() => listRef.current?.firstElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  const [menu, setMenu] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  useFlip(listRef)
  // carry a row to where it should go: a line shows the spot, and dropping puts it there (and the list follows "My order")
  const { slot, props: dropProps } = useDropSlot('list', listRef, [rows])
  const anchor = useRef<HTMLButtonElement>(null)

  // several at once: Shift-click on a computer, the Select button on a phone
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState(false)
  const del = useStore((s) => s.deleteTask)
  const ids = rows.filter((t) => picked.has(t.id)).map((t) => t.id)
  const selecting = selectMode || picked.size > 0
  const toggle = (id: string) => setPicked((p) => new Set(p.has(id) ? [...p].filter((x) => x !== id) : [...p, id]))
  const clear = () => {
    setPicked(new Set())
    setSelectMode(false)
  }

  return (
    <div className="glass mx-auto flex h-full max-w-3xl flex-col rounded-[2rem] p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <button ref={anchor} onClick={() => setMenu((o) => !o)} className="glass-soft flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm" aria-haspopup="menu" aria-expanded={menu}>
          {SORTS.find((x) => x.id === sortKey)?.label}
          <span className="text-ink-faint">▾</span>
        </button>
        <Popover open={menu} onClose={() => setMenu(false)} anchor={anchor}>
          {SORTS.map((x) => {
            const primary = x.id === sortKey
            const secondary = x.id === sortSecondaryKey
            return (
              <div key={x.id} className="flex w-full items-center rounded-xl transition hover:bg-lilac-100/80">
                <button
                  type="button"
                  onClick={() => {
                    set('sortKey', x.id)
                    if (sortSecondaryKey === x.id) set('sortSecondaryKey', null)
                    setMenu(false)
                  }}
                  className={`min-w-0 flex-1 rounded-l-xl px-3 py-2 text-left text-sm ${primary ? 'font-medium text-lilac-700' : ''}`}
                  aria-pressed={primary}
                >
                  {x.label}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (primary) return
                    set('sortSecondaryKey', secondary ? null : x.id)
                  }}
                  className={`mr-1 min-w-[3.25rem] rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition ${primary ? 'bg-lilac-500 text-white' : secondary ? 'bg-lilac-100 text-lilac-700 ring-1 ring-lilac-300' : 'text-ink-faint hover:bg-white/70'}`}
                  aria-label={primary ? `${x.label} is the first sort` : secondary ? `Remove ${x.label} as the second sort` : `Use ${x.label} as the second sort`}
                  aria-pressed={primary || secondary}
                  title={primary ? 'Primary sort' : secondary ? 'Tap to remove secondary sort' : 'Tap to use as secondary sort'}
                >
                  {primary ? '1st' : secondary ? '2nd' : ''}
                </button>
              </div>
            )
          })}
        </Popover>
        <button
          onClick={() => set('sortDesc', !sortDesc)}
          className="glass-soft rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-white/70"
          aria-label="Reverse order"
        >
          {sortDesc ? '↑ reversed' : '↓'}
        </button>
        <button
          onClick={() => (selecting ? clear() : setSelectMode(true))}
          aria-pressed={selecting}
          title="Select several items (or hold Shift and click)"
          className={`rounded-full px-3 py-1.5 text-sm transition ${selecting ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'}`}
        >
          {selecting ? 'Done' : 'Select'}
        </button>
        <span className="ml-auto text-xs text-ink-faint">{rows.length} floating</span>
      </div>
      {ids.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-1.5 text-sm">
          <span className="text-lilac-700">{ids.length} selected</span>
          <button onClick={() => setBatch(true)} className="ml-auto rounded-full bg-lilac-500 px-3.5 py-1 text-sm font-medium text-white shadow shadow-lilac-500/30">
            Edit
          </button>
          <button
            onClick={() => {
              ids.forEach((id) => del(id))
              clear()
            }}
            className="rounded-full px-3 py-1 text-sm text-ink-soft hover:text-danger-deep"
          >
            Delete
          </button>
        </div>
      )}
      <BatchEditor ids={ids} open={batch && ids.length > 0} onClose={() => setBatch(false)} />
      <QuickAdd
        listActions
        examples
        onAdd={quickAdd}
        onType={(t) => {
          setLine(t)
          if (!t.trim()) {
            setAccepted(false)
            setPlain(false)
          }
        }}
        below={
          understoodChips && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-[0.7rem] text-ink-soft" aria-live="polite">
              <span>{qaMode === 'suggest' && !accepted ? 'Looks like:' : 'Understood:'}</span>
              {understoodChips.map((c) => (
                <span key={c} className="inline-flex items-center rounded-full border border-lilac-300/70 bg-lilac-100/70 px-2 py-0.5 leading-none text-lilac-700">
                  {c}
                </span>
              ))}
              {qaMode === 'suggest' && !accepted ? (
                <button type="button" onClick={() => setAccepted(true)} className="whitespace-nowrap rounded-full bg-lilac-500 px-2.5 py-0.5 text-white">
                  Use
                </button>
              ) : (
                <button type="button" onClick={() => setPlain(true)} className="whitespace-nowrap rounded-full px-2 py-0.5 text-ink-faint underline-offset-2 hover:text-ink hover:underline">
                  Keep as typed
                </button>
              )}
            </div>
          )
        }
      />
      <span aria-live="polite" className="sr-only" data-added-announcer>
        {announce}
      </span>
      <div className="-mr-2 mt-3 flex min-h-0 flex-1 flex-col">
      <ScrollFade className="pr-2">
      <div ref={listRef} {...dropProps} className="space-y-2 py-1">
        {rows.map((t, i) => {
          const groupId = t.folderIds[0] ?? '__ungrouped'
          const previousGroupId = i > 0 ? (rows[i - 1].folderIds[0] ?? '__ungrouped') : groupId
          return (
          <div key={t.id} data-card-id={t.id} className="relative">
            {sortKey === 'group' && i > 0 && groupId !== previousGroupId && <span aria-hidden className="pointer-events-none absolute -top-1 inset-x-3 h-px bg-ink-faint/25" />}
            {slot && slot.before === t.id && <SlotLine at="top" />}
            <Row task={t} selected={picked.has(t.id)} selecting={selecting} onToggle={() => toggle(t.id)} fresh={justAdded.has(t.id)} />
            {slot && slot.before === null && i === rows.length - 1 && <SlotLine at="bottom" />}
          </div>
          )
        })}
        {rows.length === 0 && <EmptyState>Nothing here yet. Still water.</EmptyState>}
      </div>
      </ScrollFade>
      </div>
    </div>
  )
}
