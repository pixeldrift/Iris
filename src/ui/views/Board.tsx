import { useEffect, useMemo, useRef, useState } from 'react'
import { isDoneNow } from '../../core/recurrence'
import { rowKeys } from '../rowKeys'
import { hasProgress, orderInStage, patchForStage, percentsFor, progressOf, stageIndex, stagesOf, topRank, type Stage } from '../../core/progress'
import { NumberField } from '../NumberPad'
import { sortTasks, effectiveUrgency } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useBoardSlot } from '../boardSlot'
import { askConfirm } from '../dialogs'
import { useDnd, useDropTarget } from '../dnd'
import { IconChevronDown, IconClose, IconPencil, IconPlus } from '../icons'
import { Popover } from '../Popover'
import { ScrollFade } from '../ScrollFade'
import { colorVars, useTaskHue } from '../taskColor'
import { useIsMobile } from '../useMedia'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { CountBubble, Dim, DoneButton, DueChip, FolderChips, ItemBadges, GripDots, GripHandle, PlaceChip, SlotLine, TallyIncrement, useTaskDrag } from '../shared'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

function Card({ task }: { task: Task }) {
  const el = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const leave = useLeaveClass(task, true)
  const hue = useTaskHue(task)
  return (
    <Dim id={task.id}>
      <div
        ref={el}
        data-lift-id={`task:${task.id}`}
        {...rowKeys(() => useStore.getState().select(task.id))}
        onPointerDown={(e) => onPointerDown(e)}
        style={colorVars(hue, effectiveUrgency(task))}
        className={`tint lift-on-press rise-in group relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-lilac-400 rounded-2xl px-2.5 py-2 transition hover:-translate-y-0.5 ${leave}`}
      >
        <div className="flex items-start gap-2 pr-5">
          <DoneButton task={task} size={20} />
          <p className={`min-w-0 flex-1 text-[0.92rem] leading-snug ${isDoneNow(task) ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</p>
          <TallyIncrement task={task} compact />
        </div>
        {/* the handle sits at the right edge, level with the checkbox */}
        <span className="absolute right-1 top-2 grid h-5 place-items-center">
          <GripHandle compact onPointerDown={onPointerDown} />
        </span>
        {hasProgress(task.kind) && task.status !== 'done' && progressOf(task) > 0 && (
          <div className="mt-1 flex items-center gap-1.5 pl-7" title={`${progressOf(task)}% done`}>
            <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/60" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressOf(task)} aria-label="Progress">
              <span className="absolute inset-y-0 left-0 rounded-full bg-lilac-400" style={{ width: `${progressOf(task)}%` }} />
            </span>
            <span className="text-[0.65rem] tabular-nums text-ink-faint">{task.tally ? `${task.tally.done}/${task.tally.total}` : `${progressOf(task)}%`}</span>
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-7 empty:hidden">
          <DueChip task={task} />
          <ItemBadges task={task} max={2} />
          <PlaceChip task={task} />
          <FolderChips task={task} max={2} />
          {(task.images?.[0] || task.image) && <img src={task.images?.[0] || task.image} alt="" draggable={false} className="ml-auto h-8 w-8 shrink-0 rounded-lg border border-white/70 object-cover shadow-sm" />}
        </div>
      </div>
    </Dim>
  )
}

export function Board() {
  const visible = useVisibleTasks(true)
  const addTask = useStore((s) => s.addTask)
  const scope = useStore((s) => s.scope)
  const folders = useStore((s) => s.folders)
  const folder = scope.type === 'folder' ? (folders.find((f) => f.id === scope.id) ?? null) : null
  const stages = stagesOf(folder)
  const sorted = useMemo(() => sortTasks(visible, 'flow', false), [visible])
  const [editor, setEditor] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const columns = useRef<HTMLDivElement>(null)
  /** Bring a stage's box into view (when it is off screen) from the names along the top. */
  const show = (id: string) => columns.current?.querySelector(`[data-stage="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1 px-1 text-xs text-ink-soft">
        <nav aria-label="Stages" className="no-scrollbar flex min-w-0 items-center overflow-x-auto whitespace-nowrap">
          {stages.map((st, i) => (
            <span key={st.id} className="flex items-center">
              {i > 0 && <span aria-hidden className="mx-1.5 text-ink-faint">·</span>}
              <button onClick={() => show(st.id)} className="rounded-full px-1.5 py-0.5 transition hover:bg-white/60 hover:text-lilac-700">
                {st.name}
              </button>
            </span>
          ))}
        </nav>
        {folder && (
          <>
            <button ref={anchor} onClick={() => setEditor((o) => !o)} aria-haspopup="dialog" aria-expanded={editor} aria-label="Edit stages" title="Edit stages" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-lilac-600">
              <IconPencil size={13} />
            </button>
            <StagesEditor open={editor} onClose={() => setEditor(false)} anchor={anchor} folderId={folder.id} stages={stages} custom={!!folder.stages} given={folder.stagePercents} />
          </>
        )}
      </div>
      <div ref={columns} className="pointer-events-none -mx-8 -mb-8 -mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-8 pb-8 pt-3 md:grid md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:overflow-x-auto md:overflow-y-visible">
        {stages.map((st, i) => {
          const tasks = orderInStage(sorted.filter((t) => stageIndex(t, stages) === i))
          return (
            <Column
              key={st.id}
              id={st.id}
              target={`stage:${folder ? folder.id : '-'}:${st.id}`}
              name={st.name}
              tasks={tasks}
              // a new item goes to the top of its column
              onAdd={(title) => addTask({ title, ...(folder ? { folderIds: [folder.id] } : {}), ...patchForStage(stages, i), rank: topRank(tasks) })}
            />
          )
        })}
      </div>
    </div>
  )
}

function Column({ id, target, name, tasks, onAdd }: { id: string; target: string; name: string; tasks: Task[]; onAdd: (t: string) => string }) {
  const { over, active, props } = useDropTarget(target)
  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const mobile = useIsMobile()
  const list = useRef<HTMLDivElement>(null)

  // while an item is carried over this box: where in the list it would land (above or below the middle of each item)
  const dragId = useDnd((s) => (s.drag?.payload.type === 'task' ? s.drag.payload.id : null))
  const dragY = useDnd((s) => (over && s.drag?.payload.type === 'task' ? s.drag.y : null))
  const slot = useMemo(() => {
    if (dragY === null || !list.current) return null
    const cards = [...list.current.querySelectorAll<HTMLElement>('[data-card-id]')].filter((e) => e.dataset.cardId !== dragId)
    let index = 0
    for (const c of cards) {
      const r = c.getBoundingClientRect()
      if (dragY > r.top + r.height / 2) index++
      else break
    }
    return { index, before: cards[index]?.dataset.cardId ?? null, ids: cards.map((c) => c.dataset.cardId!) }
  }, [dragY, dragId, tasks])
  const ids = slot?.ids.join(',')
  useEffect(() => {
    if (slot) useBoardSlot.setState({ target, index: slot.index, ids: slot.ids })
    else if (useBoardSlot.getState().target === target) useBoardSlot.setState({ target: null, index: 0, ids: [] })
  }, [slot?.index, ids, target]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = (
    <>
      {adding && <NewItem name={name} onDone={() => setAdding(false)} onAdd={(t) => (onAdd(t), setAdding(false))} />}
      {tasks.map((t, i) => (
        <div key={t.id} data-card-id={t.id} className="relative">
          {slot && slot.before === t.id && <SlotLine at="top" />}
          <Card task={t} />
          {slot && slot.before === null && i === tasks.length - 1 && <SlotLine at="bottom" />}
        </div>
      ))}
      {/* an empty box still takes a drop, and shows where it will go */}
      {tasks.length === 0 && !adding && <div className="relative h-8">{slot && <SlotLine at="top" />}</div>}
    </>
  )

  return (
    <section
      {...props}
      data-stage={id}
      className={`glass pointer-events-auto flex shrink-0 flex-col self-stretch rounded-[1.8rem] p-3.5 transition md:shrink md:self-start ${open ? 'min-h-[10rem] md:min-h-0 md:self-stretch' : ''} ${over ? 'bg-lilac-100/50 outline outline-[3px] outline-lilac-500' : active ? 'outline outline-1 outline-lilac-300/60' : ''}`}
    >
      <header className={`flex items-center gap-2 ${open ? 'mb-2' : ''}`}>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 rounded-xl px-1 py-0.5 text-left">
          <span className={`inline-grid place-items-center text-ink-faint transition-transform duration-300 ${open ? '' : '-rotate-90'}`}>
            <IconChevronDown size={16} />
          </span>
          <h3 className="min-w-0 truncate font-display text-lg">{name}</h3>
          <CountBubble n={tasks.length} className="ml-auto" />
        </button>
        <button
          onClick={() => {
            setOpen(true)
            setAdding(true)
          }}
          aria-label={`Add a task to ${name}`}
          title="Add a task"
          className="grid h-[1.3rem] w-[1.3rem] shrink-0 place-items-center rounded-full bg-lilac-500 text-white shadow-sm shadow-lilac-500/30 transition hover:bg-lilac-600"
        >
          <IconPlus size={12} />
        </button>
      </header>
      {open &&
        // side by side the box scrolls inside itself; stacked on a phone it grows with its list, pushing the boxes below it down
        (mobile ? (
          <div ref={list} className="space-y-2 px-2 py-2 -mx-2">
            {items}
          </div>
        ) : (
          <div className="-mx-2 flex min-h-0 flex-1 flex-col">
            <ScrollFade panX className="px-2">
              <div ref={list} className="space-y-2 py-2">
                {items}
              </div>
            </ScrollFade>
          </div>
        ))}
    </section>
  )
}

/** The box that opens at the top of a column to type a new item in; Enter makes it the item, right there. */
function NewItem({ name, onAdd, onDone }: { name: string; onAdd: (title: string) => void; onDone: () => void }) {
  const [v, setV] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <form
      className="rise-in"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.trim()) onAdd(v.trim())
        else onDone()
      }}
    >
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onDone())}
        onBlur={() => !v.trim() && onDone()}
        placeholder="Add a task…"
        aria-label={`Add a task to ${name}`}
        data-proxy-commit
        className="well w-full rounded-2xl px-3 py-2 text-sm"
      />
    </form>
  )
}

/** Rename, reorder (drag the handles), add and remove a group's stages. The last one is "done": reaching it completes an item. */
function StagesEditor({ open, onClose, anchor, folderId, stages, custom, given }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; folderId: string; stages: Stage[]; custom: boolean; given?: number[] }) {
  const update = useStore((s) => s.updateFolder)
  // the percent at which an item enters each column belongs to the place in the row, so reordering the names leaves the percents where they are
  const percents = percentsFor(stages.length, given)
  const save = (next: Stage[] | undefined, nextPercents: number[] | undefined = next ? percents : undefined) => update(folderId, { stages: next, stagePercents: next ? nextPercents : undefined })
  const setPercent = (p: number, v: number) => save(stages, percents.map((x, k) => (k === p ? v : x)))
  const set = (i: number, name: string) => save(stages.map((s, k) => (k === i ? { ...s, name } : s)))
  const listRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const move = <T,>(a: T[], from: number, to: number) => {
    const n = [...a]
    n.splice(to, 0, n.splice(from, 1)[0])
    return n
  }
  /** Carry a stage by its handle: the rows rearrange as it passes them; letting go keeps the order. */
  const begin = (from: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const rows = [...(listRef.current?.children ?? [])].map((r) => (r as HTMLElement).getBoundingClientRect())
    let to = from
    const at = (y: number) => {
      const i = rows.findIndex((r) => y < r.bottom)
      return i < 0 ? rows.length - 1 : i
    }
    const onMove = (ev: PointerEvent) => {
      to = at(ev.clientY)
      setDrag({ from, to })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDrag(null)
      if (to !== from) save(move(stages, from, to))
    }
    setDrag({ from, to })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  const shown = drag ? move(stages, drag.from, drag.to) : stages
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} className="w-80 p-3">
      <div className="px-1 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Stages, first to last</div>
      <ul ref={listRef} className="space-y-1.5">
        {shown.map((s, p) => {
          const i = stages.findIndex((x) => x.id === s.id)
          return (
            <li key={s.id} className={`flex items-center gap-1 rounded-xl transition ${drag && stages[drag.from].id === s.id ? 'bg-white/70 shadow-md' : ''}`}>
              {/* the percent at which an item enters this place in the row: fixed at 0 and 100 for the first and last */}
              <span className="flex w-14 shrink-0 items-center justify-end gap-0.5 text-sm tabular-nums text-ink-soft">
                {p === 0 || p === stages.length - 1 ? (
                  <span className="px-1 text-ink-faint">{p === 0 ? 0 : 100}%</span>
                ) : (
                  <>
                    <NumberField label={`Stage ${p + 1} starts at percent`} value={percents[p]} min={percents[p - 1] + 1} max={p === stages.length - 2 ? 99 : percents[p + 1] - 1} className="!h-7 !min-w-[2.6rem] !text-sm" onChange={(v) => setPercent(p, v)} />%
                  </>
                )}
              </span>
              <input value={s.name} onChange={(e) => set(i, e.target.value)} aria-label={`Stage ${i + 1} name`} className="well min-w-0 flex-1 rounded-lg px-2.5 py-1 text-sm" />
              <button onClick={() => save(stages.filter((_, k) => k !== i), percents.filter((_, k) => k !== Math.min(i, percents.length - 2)))} disabled={stages.length <= 2} aria-label={`Remove ${s.name}`} className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-danger-deep disabled:opacity-30">
                <IconClose size={12} />
              </button>
              <span data-grip onPointerDown={begin(i)} role="button" aria-label={`Move ${s.name}`} title="Drag to reorder" className="grid h-7 w-6 shrink-0 cursor-grab touch-none place-items-center">
                <GripDots />
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            // a new stage goes just before the last one, which always means "done"
            const next = [...stages]
            const at = Math.max(1, next.length - 1)
            next.splice(at, 0, { id: uid(), name: 'New stage' })
            // its percent sits half way between the ones either side of it
            const np = [...percents]
            np.splice(at, 0, Math.round((percents[at - 1] + 100) / 2))
            save(next, np)
          }}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-lilac-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600"
        >
          <IconPlus size={14} /> Add stage
        </button>
        {custom && (
          <button
            onClick={async () => {
              if (await askConfirm({ title: 'Restore the default stages?', message: 'This group goes back to Not started, In progress and Completed. Items keep their place by status.', confirmLabel: 'Restore', cancelLabel: 'Keep mine' })) save(undefined)
            }}
            className="ml-auto whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink-soft transition hover:bg-white/70"
          >
            Restore defaults
          </button>
        )}
      </div>
      <p className="px-1 pt-2.5 text-[0.7rem] text-ink-faint">The percent is where an item enters that stage: moving a card sets its progress to it, and an item whose progress reaches it moves there. The last stage is “done” (100%), and tasks moved here are automatically checked off.</p>
    </Popover>
  )
}
