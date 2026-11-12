import { useEffect, useMemo, useRef, useState } from 'react'
import { createFromLine, understandLine } from '../quickCreate'
import { isDoneNow } from '../../core/recurrence'
import { useFlip } from '../flip'
import { ScrollFade } from '../ScrollFade'
import { sortTasks, effectiveUrgency } from '../../core/tasks'
import type { SortKey, Task } from '../../core/types'
import { useStore } from '../../state/store'
import { MenuItem, Popover } from '../Popover'
import { IconCheck, IconTrash } from '../icons'
import { BatchEditor } from '../BatchEditor'
import { colorVars, useTaskHue } from '../taskColor'
import { rowKeys } from '../rowKeys'
import { EmptyState } from '../EmptyState'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { Dim, DoneButton, DueChip, FolderChips, PlaceChip, QuickAdd, SlotLine, TaskFlower, ItemBadges, ItemProgress, useTaskDrag } from '../shared'
import { useDropSlot } from '../dropSlot'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'flow', label: 'Priority' },
  { id: 'importance', label: 'Importance' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'due', label: 'Due date' },
  { id: 'created', label: 'Newest' },
  { id: 'title', label: 'A → Z' },
  { id: 'manual', label: 'My order' },
]

/**
 * Swipe a row sideways (touch): left deletes it, right checks it off (a line is drawn across its name as it is ticked; swiped right again,
 * the line is taken back off). It only takes over when the finger clearly moves sideways, so scrolling stays vertical, and a
 * press-and-hold that has already picked the row up for the sidebar is never mistaken for it.
 */
function useSwipe(row: React.RefObject<HTMLDivElement | null>, revealDelete: React.RefObject<HTMLDivElement | null>, revealCheck: React.RefObject<HTMLDivElement | null>, onDelete: () => void, onCheck: () => void) {
  return (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const el = row.current
    if (!el) return
    const sx = e.clientX
    const sy = e.clientY
    let swiping = false
    const apply = (dx: number) => {
      el.style.transform = `translateX(${dx}px)`
      if (revealDelete.current) revealDelete.current.style.opacity = String(dx < 0 ? Math.min(1, -dx / 80) : 0)
      if (revealCheck.current) revealCheck.current.style.opacity = String(dx > 0 ? Math.min(1, dx / 80) : 0)
    }
    const end = (commit: boolean, dx: number) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (!swiping) return
      el.style.transition = 'transform 0.22s ease-out'
      const need = Math.min(el.offsetWidth * 0.35, 120)
      if (commit && dx < -need) {
        el.style.transform = 'translateX(-110%)'
        onDelete()
        return
      }
      const check = commit && dx > need
      apply(0)
      window.setTimeout(() => {
        el.style.transition = ''
        el.style.transform = ''
        if (revealDelete.current) revealDelete.current.style.opacity = '0'
        if (revealCheck.current) revealCheck.current.style.opacity = '0'
      }, 240)
      if (check) onCheck() // (the row springs back, and the line goes across its name)
    }
    const move = (ev: PointerEvent) => {
      if (document.body.classList.contains('dragging')) return end(false, 0) // it was picked up to be dragged instead
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!swiping) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return end(false, 0) // a scroll
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          swiping = true
          el.style.transition = 'none'
        } else return
      }
      apply(dx)
    }
    const up = (ev: PointerEvent) => end(true, ev.clientX - sx)
    const cancel = () => end(false, 0)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
}

function Row({ task, selected, selecting, onToggle, fresh = false }: { task: Task; selected: boolean; selecting: boolean; onToggle: () => void; /** Just added from the quick-add box: it glows for a moment. */ fresh?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const reveal = useRef<HTMLDivElement>(null)
  const revealCheck = useRef<HTMLDivElement>(null)
  const strike = useRef<HTMLSpanElement>(null)
  const hue = useTaskHue(task)
  // Shift-click (or select mode) picks the item instead of opening it
  const onPointerDown = useTaskDrag(task, el, (e) => (e.shiftKey || selecting ? onToggle() : useStore.getState().select(task.id)))
  const del = useStore((s) => s.deleteTask)
  const toggleDone = useStore((s) => s.toggleDone)
  const done = isDoneNow(task)
  // checking off by swipe: a line is drawn across the name (left to right), then the item is ticked; swiping a done one back draws it off again
  const check = () => {
    const line = strike.current
    const finish = () => {
      toggleDone(task.id)
      if (line) window.setTimeout(() => (line.style.opacity = '0'), 160)
    }
    if (!line || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return finish()
    line.style.opacity = '1'
    const frames = done ? [{ transform: 'scaleX(1)', transformOrigin: 'right' }, { transform: 'scaleX(0)', transformOrigin: 'right' }] : [{ transform: 'scaleX(0)', transformOrigin: 'left' }, { transform: 'scaleX(1)', transformOrigin: 'left' }]
    const a = line.animate(frames, { duration: 380, easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)', fill: 'forwards' })
    void a.finished.then(() => {
      finish()
      a.cancel()
      line.style.transform = ''
    }).catch(() => finish())
  }
  const swipe = useSwipe(el, reveal, revealCheck, () => del(task.id), check)
  const leave = useLeaveClass(task)
  return (
    <Dim id={task.id}>
      <div className="relative overflow-x-clip rounded-2xl">
        <div ref={reveal} aria-hidden className="absolute inset-0 flex items-center justify-end rounded-2xl pr-5 text-white opacity-0" style={{ background: 'rgb(210 110 140 / 0.9)' }}>
          <IconTrash size={18} />
        </div>
        <div ref={revealCheck} aria-hidden className="absolute inset-0 flex items-center justify-start rounded-2xl pl-5 text-white opacity-0" style={{ background: 'rgb(var(--lr-500) / 0.9)' }}>
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
          className={`tint lift-on-press group rise-in relative flex cursor-pointer outline-none ${fresh ? 'just-added' : ''} focus-visible:ring-2 focus-visible:ring-lilac-400 items-center gap-2.5 select-none rounded-2xl px-3 py-2.5 [-webkit-touch-callout:none] ${selected ? 'ring-2 ring-lilac-500' : ''} ${leave}`}
        >
          {(selecting || selected) && (
            <span aria-hidden className={`well-circle grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] leading-none text-white ${selected ? 'is-on' : ''}`}>
              {selected ? '✓' : ''}
            </span>
          )}
          <DoneButton task={task} />
          <TaskFlower task={task} />
          <span className="min-w-0 flex-1">
            <span className="relative inline-block max-w-full align-top">
              <span className={`block truncate ${done ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</span>
              {/* the line that is drawn across the name when it is swiped off (hidden otherwise) */}
              <span ref={strike} aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 -mt-px h-[2px] rounded-full bg-lilac-500/80 opacity-0" />
            </span>
          </span>
          {/* the chips, with how far along it is as a thin bar underneath them */}
          <div className="flex shrink-0 flex-col items-stretch gap-0.5">
            <div className="flex items-center justify-end gap-1">
              <span data-lift-extra className="hidden items-center gap-1 sm:flex">
                <ItemBadges task={task} progress={false} />
                <PlaceChip task={task} />
                <FolderChips task={task} max={2} />
              </span>
              <span data-lift-extra className="flex items-center">
                <DueChip task={task} compact />
              </span>
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
            className="absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink-faint opacity-0 shadow-sm transition hover:text-danger-deep md:grid md:group-hover:opacity-100"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>
    </Dim>
  )
}

export function ListView() {
  const visible = useVisibleTasks()
  const sortKey = useStore((s) => s.settings.sortKey)
  const sortDesc = useStore((s) => s.settings.sortDesc)
  const set = useStore((s) => s.setSetting)

  const sorted = useMemo(() => sortTasks(visible, sortKey, sortDesc), [visible, sortKey, sortDesc])
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
  const folders = useStore((s) => s.folders)
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
          {SORTS.map((x) => (
            <MenuItem
              key={x.id}
              active={x.id === sortKey}
              onClick={() => {
                set('sortKey', x.id)
                setMenu(false)
              }}
            >
              {x.label}
            </MenuItem>
          ))}
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
        {rows.map((t, i) => (
          <div key={t.id} data-card-id={t.id} className="relative">
            {slot && slot.before === t.id && <SlotLine at="top" />}
            <Row task={t} selected={picked.has(t.id)} selecting={selecting} onToggle={() => toggle(t.id)} fresh={justAdded.has(t.id)} />
            {slot && slot.before === null && i === rows.length - 1 && <SlotLine at="bottom" />}
          </div>
        ))}
        {rows.length === 0 && <EmptyState>Nothing here yet. Still water.</EmptyState>}
      </div>
      </ScrollFade>
      </div>
    </div>
  )
}
