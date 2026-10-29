import { useMemo, useRef, useState } from 'react'
import { DEFAULT_STAGES, patchForStage, stageIndex, stagesOf, type Stage } from '../../core/progress'
import { sortTasks } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { IconChevronDown, IconClose, IconPlus } from '../icons'
import { Popover } from '../Popover'
import { ScrollFade } from '../ScrollFade'
import { colorVars, useTaskHue } from '../taskColor'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { CountBubble, Dim, DoneButton, DueChip, FolderChips, GripHandle, QuickAdd, useTaskDrag } from '../shared'

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
        onPointerDown={(e) => onPointerDown(e)}
        style={colorVars(hue, task.urgency)}
        className={`tint lift-on-press rise-in group cursor-pointer rounded-2xl p-3 shadow-[0_6px_20px_-10px_rgb(var(--lr-700)/0.3)] transition hover:-translate-y-0.5 ${leave}`}
      >
        <div className="flex items-start gap-2">
          <DoneButton task={task} size={20} />
          <p className={`min-w-0 flex-1 text-[0.92rem] leading-snug ${task.status === 'done' ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</p>
          <GripHandle onPointerDown={onPointerDown} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <DueChip task={task} />
          <FolderChips task={task} max={2} />
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

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2 px-1 text-xs text-ink-soft">
        <span className="min-w-0 truncate">{folder ? `Stages for ${folder.name}` : 'Pending, In Progress and Completed. Open a group to give it stages of its own.'}</span>
        {folder && (
          <>
            <button ref={anchor} onClick={() => setEditor((o) => !o)} aria-haspopup="dialog" aria-expanded={editor} className="glass-soft shrink-0 rounded-full px-3 py-1 text-xs text-lilac-700 hover:bg-white/70">
              Edit stages
            </button>
            <StagesEditor open={editor} onClose={() => setEditor(false)} anchor={anchor} folderId={folder.id} stages={stages} custom={!!folder.stages} />
          </>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:content-normal md:overflow-x-auto md:overflow-y-visible">
        {stages.map((st, i) => (
          <Column
            key={st.id}
            target={`stage:${folder ? folder.id : '-'}:${st.id}`}
            name={st.name}
            tasks={sorted.filter((t) => stageIndex(t, stages) === i)}
            onAdd={(title) => addTask({ title, ...(folder ? { folderIds: [folder.id] } : {}), ...patchForStage(stages, i) })}
          />
        ))}
      </div>
    </div>
  )
}

function Column({ target, name, tasks, onAdd }: { target: string; name: string; tasks: Task[]; onAdd: (t: string) => void }) {
  const { over, active, props } = useDropTarget(target)
  const [open, setOpen] = useState(true)
  return (
    <section
      {...props}
      className={`glass flex flex-col self-start rounded-[1.8rem] p-3.5 transition ${open ? 'min-h-[16rem] md:min-h-0 md:self-stretch' : ''} ${over ? 'ring-2 ring-lilac-400/70 bg-lilac-100/50' : active ? 'ring-1 ring-lilac-300/50' : ''}`}
    >
      <header
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o))}
        className={`flex cursor-pointer select-none items-center gap-2 rounded-xl px-1 py-0.5 ${open ? 'mb-3' : ''}`}
      >
        <span className={`inline-grid place-items-center text-ink-faint transition-transform duration-300 ${open ? '' : '-rotate-90'}`}>
          <IconChevronDown size={16} />
        </span>
        <h3 className="min-w-0 truncate font-display text-lg">{name}</h3>
        <CountBubble n={tasks.length} className="ml-auto" />
      </header>
      {open && (
        <>
          <QuickAdd placeholder="＋ add" onAdd={onAdd} />
          <div className="-mr-1.5 mt-2.5 flex min-h-0 flex-1 flex-col">
            <ScrollFade className="pr-1.5">
              <div className="space-y-2 py-1">
                {tasks.map((t) => (
                  <Card key={t.id} task={t} />
                ))}
              </div>
            </ScrollFade>
          </div>
        </>
      )}
    </section>
  )
}

/** Rename, reorder, add and remove a group's stages. The last one is "done": reaching it completes an item. */
function StagesEditor({ open, onClose, anchor, folderId, stages, custom }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; folderId: string; stages: Stage[]; custom: boolean }) {
  const update = useStore((s) => s.updateFolder)
  const save = (next: Stage[] | undefined) => update(folderId, { stages: next })
  const set = (i: number, name: string) => save(stages.map((s, k) => (k === i ? { ...s, name } : s)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= stages.length) return
    const next = [...stages]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} className="w-72 p-3">
      <div className="px-1 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Stages, first to last</div>
      <ul className="space-y-1.5">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1">
            <input value={s.name} onChange={(e) => set(i, e.target.value)} aria-label={`Stage ${i + 1} name`} className="well min-w-0 flex-1 rounded-lg px-2.5 py-1 text-sm" />
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-white/70 disabled:opacity-30">
              <span className="rotate-180"><IconChevronDown size={14} /></span>
            </button>
            <button onClick={() => move(i, 1)} disabled={i === stages.length - 1} aria-label="Move down" className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-white/70 disabled:opacity-30">
              <IconChevronDown size={14} />
            </button>
            <button onClick={() => save(stages.filter((_, k) => k !== i))} disabled={stages.length <= 2} aria-label={`Remove ${s.name}`} className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-[#b04a6e] disabled:opacity-30">
              <IconClose size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center">
        <button
          onClick={() => {
            // a new stage goes just before the last one, which always means "done"
            const next = [...stages]
            next.splice(Math.max(1, next.length - 1), 0, { id: uid(), name: 'New stage' })
            save(next)
          }}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-lilac-700 hover:bg-lilac-100/80"
        >
          <IconPlus size={14} /> Add a stage
        </button>
        {custom && (
          <button onClick={() => save(undefined)} className="ml-auto rounded-full px-2.5 py-1.5 text-xs text-ink-faint hover:text-ink">
            Back to {DEFAULT_STAGES.map((d) => d.name).join(' / ')}
          </button>
        )}
      </div>
      <p className="px-1 pt-2 text-[0.7rem] text-ink-faint">The last stage is “done”: items that reach it count as completed.</p>
    </Popover>
  )
}
