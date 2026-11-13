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
  { id: 'group', label: 'Group' },
  { id: 'manual', label: 'My order' },
]

/**
 * Swipe a row sideways (touch): left deletes it, right checks it off (a line is drawn across its name as it is ticked; swiped right again,
 * the line is taken back off). It only takes over when the finger clearly moves sideways, so scrolling stays vertical, and a
 * press-and-hold that has already picked the row up for the sidebar is never mistaken for it.
 */
function useSwipe(row: React.RefObject<HTMLDivElement | null>, revealDelete: React.RefObject<HTMLDivElement | null>, deleteChips: React.RefObject<HTMLDivElement | null>, deleteTitle: React.RefObject<HTMLSpanElement | null>, deleteLid: React.RefObject<SVGPathElement | null>, revealCheck: React.RefObject<HTMLDivElement | null>, strike: React.RefObject<HTMLSpanElement | null>, wasDone: boolean, onDelete: () => void, onCheck: () => void) {
  return (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const el = row.current
    if (!el) return
    const sx = e.clientX
    const sy = e.clientY
    let swiping = false
    const need = Math.min(el.offsetWidth * 0.35, 120)
    const origin = wasDone ? 'right' : 'left'
    const restingScale = wasDone ? 1 : 0
    const apply = (dx: number) => {
      el.style.transform = `translateX(${dx}px)`
      if (revealDelete.current) revealDelete.current.style.opacity = dx < -6 ? '1' : '0'
      const chipShift = Math.min(1, Math.max(0, -dx) / 80) * 38
      if (deleteChips.current) deleteChips.current.style.transform = `translateX(${-chipShift}px)`
      if (deleteTitle.current) deleteTitle.current.style.paddingRight = `${chipShift}px`
      if (deleteLid.current) {
        const progress = Math.min(1, Math.max(0, -dx) / need)
        deleteLid.current.style.transform = `rotate(${progress * 38}deg) translateY(${-progress * 3}px)`
      }
      if (revealCheck.current) revealCheck.current.style.opacity = String(dx > 0 ? Math.min(1, dx / 80) : 0)
      if (strike.current) {
        const progress = Math.min(1, Math.max(0, dx) / need)
        const scale = wasDone ? 1 - progress : progress
        strike.current.style.transformOrigin = origin
        strike.current.style.transform = `scaleX(${scale})`
        strike.current.style.opacity = String(wasDone || progress > 0 ? 1 : 0)
      }
    }
    const end = (commit: boolean, dx: number) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (!swiping) return
      const check = commit && dx > need
      const spring = '420ms cubic-bezier(0.2, 0.9, 0.25, 1.15)'
      el.style.transition = `transform ${spring}`
      if (commit && dx < -need) {
        // Snap the lid shut first, then sweep the row away so the delete action reads clearly.
        if (revealDelete.current) {
          revealDelete.current.style.transition = 'background-color 140ms ease, color 140ms ease, opacity 180ms ease-out'
          revealDelete.current.style.backgroundColor = 'rgb(210 110 140 / 0.9)'
          revealDelete.current.style.color = 'white'
        }
        if (deleteLid.current) {
          deleteLid.current.style.transition = 'transform 100ms cubic-bezier(0.2, 0.8, 0.2, 1)'
          deleteLid.current.style.transform = 'rotate(0deg) translateY(0)'
        }
        window.setTimeout(() => {
          el.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
          el.style.transform = 'translateX(-110%) scale(0.96)'
          window.setTimeout(onDelete, 220)
        }, 90)
        return
      }
      if (check) {
        // The line has reached its end with the finger; let the row spring home while
        // the completed/undone state catches up underneath it.
        el.style.transform = 'translateX(0)'
        if (revealCheck.current) revealCheck.current.style.opacity = '0'
        if (strike.current) {
          strike.current.style.transition = 'none'
          strike.current.style.transformOrigin = origin
          strike.current.style.transform = `scaleX(${wasDone ? 0 : 1})`
          strike.current.style.opacity = '1'
        }
        onCheck()
        window.setTimeout(() => {
          if (strike.current) {
            strike.current.style.transition = 'opacity 160ms ease-out'
            strike.current.style.opacity = '0'
            window.setTimeout(() => {
              if (!strike.current) return
              strike.current.style.transition = ''
              strike.current.style.transform = `scaleX(${restingScale})`
            }, 180)
          }
        }, 160)
      } else {
        // Incomplete gestures retreat to their original state with a spring.
        if (strike.current) strike.current.style.transition = `transform ${spring}, opacity 180ms ease-out`
        if (deleteLid.current) deleteLid.current.style.transition = `transform ${spring}`
        if (revealDelete.current) revealDelete.current.style.transition = 'opacity 180ms ease-out'
        if (deleteChips.current) deleteChips.current.style.transition = `transform ${spring}`
        apply(0)
      }
      window.setTimeout(() => {
        el.style.transition = ''
        el.style.transform = ''
        if (deleteChips.current) {
          deleteChips.current.style.transform = ''
          deleteChips.current.style.transition = ''
        }
        if (deleteTitle.current) deleteTitle.current.style.paddingRight = ''
        if (revealDelete.current) {
          revealDelete.current.style.opacity = '0'
          revealDelete.current.style.transition = ''
          revealDelete.current.style.backgroundColor = 'white'
          revealDelete.current.style.color = ''
        }
        if (deleteLid.current) deleteLid.current.style.transition = ''
        if (revealCheck.current) revealCheck.current.style.opacity = '0'
      }, 440)
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
          if (strike.current) {
            strike.current.style.transition = 'none'
            strike.current.style.transformOrigin = origin
            strike.current.style.transform = `scaleX(${restingScale})`
            strike.current.style.opacity = '1'
          }
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
  const deleteChips = useRef<HTMLDivElement>(null)
  const deleteTitle = useRef<HTMLSpanElement>(null)
  const deleteLid = useRef<SVGPathElement>(null)
  const revealCheck = useRef<HTMLDivElement>(null)
  const strike = useRef<HTMLSpanElement>(null)
  const hue = useTaskHue(task)
  // Shift-click (or select mode) picks the item instead of opening it
  const onPointerDown = useTaskDrag(task, el, (e) => (e.shiftKey || selecting ? onToggle() : useStore.getState().select(task.id)))
  const del = useStore((s) => s.deleteTask)
  const toggleDone = useStore((s) => s.toggleDone)
  const done = isDoneNow(task)
  // The strikethrough is drawn by the live swipe gesture; completion only changes task state.
  const check = () => toggleDone(task.id)
  const swipe = useSwipe(el, reveal, deleteChips, deleteTitle, deleteLid, revealCheck, strike, done, () => del(task.id), check)
  const leave = useLeaveClass(task)
  return (
    <Dim id={task.id}>
      <div className="relative overflow-x-clip overflow-y-visible rounded-2xl">
        <div ref={reveal} aria-hidden className="absolute inset-0 flex items-center justify-end overflow-visible rounded-2xl pr-5 text-[#dc2626] opacity-0" style={{ background: '#fff', isolation: 'isolate' }}>
          <span className="relative z-10 mr-0.5 block h-8 w-8 overflow-visible text-[#dc2626] opacity-100">
            <svg viewBox="-4 -5 32 34" width="32" height="34" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
              <path ref={deleteLid} d="M4 7h16 M9 7V4h6v3" style={{ transformBox: 'fill-box', transformOrigin: 'right center' }} />
              <path d="M10 11v6 M14 11v6 M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
            </svg>
          </span>
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
          <span ref={deleteTitle} className="min-w-0 flex-1">
            <span className="relative inline-block max-w-full align-top">
              <span className={`block truncate ${done ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</span>
              {/* the line that is drawn across the name when it is swiped off (hidden otherwise) */}
              <span ref={strike} aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 -mt-px h-[2px] rounded-full bg-lilac-500/80 opacity-0" />
            </span>
          </span>
          {/* the chips, with how far along it is as a thin bar underneath them */}
          <div ref={deleteChips} className="flex shrink-0 flex-col items-stretch gap-0.5">
            <div className="flex items-center justify-end gap-1">
              <span data-lift-extra className="hidden items-center gap-1 sm:flex">
                <ItemBadges task={task} progress={false} />
                <PlaceChip task={task} />
                <FolderChips task={task} max={2} />
              </span>
              <span data-lift-extra className="flex items-center">
                <DueChip task={task} compact />
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
  const folders = useStore((s) => s.folders)

  const sorted = useMemo(() => sortTasks(visible, sortKey, sortDesc, folders), [visible, sortKey, sortDesc, folders])
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
