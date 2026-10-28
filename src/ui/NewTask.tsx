import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { drop } from '../audio/engine'
import { useExit } from './anim'
import { IconChevronDown, IconClose } from './icons'
import { TagInput } from './TagInput'
import { TaskFields } from './TaskDetail'
import { KINDS } from './shared'
import type { TaskKind } from '../core/types'
import { parseQuickAdd } from '../core/quickadd'
import { askNotify } from './notify'

/** Where a new item should land in the pond (fractions of the canvas); none = somewhere near the middle. */
interface ComposeState {
  open: boolean
  at: { x: number; y: number } | null
  /** Groups the new item starts in (from the + beside a group). */
  folderIds: string[] | null
}
const useCompose = create<ComposeState>(() => ({ open: false, at: null, folderIds: null }))
export const openCompose = (at: { x: number; y: number } | null = null, folderIds: string[] | null = null) => useCompose.setState({ open: true, at, folderIds })
const closeCompose = () => useCompose.setState({ open: false })

/** One exclusive pill: the highlight slides to whichever type is chosen, with a single soft overshoot. */
function KindToggle({ value, onChange }: { value: TaskKind; onChange: (k: TaskKind) => void }) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  const settled = useRef(false)
  useLayoutEffect(() => {
    const el = refs.current.get(value)
    // offsets, not screen rects: the box is still scaling in when this first runs
    if (el) setBox({ left: el.offsetLeft + (el.parentElement?.offsetLeft ?? 0), width: el.offsetWidth })
  }, [value])
  useEffect(() => {
    // no slide on the very first placement
    const id = requestAnimationFrame(() => (settled.current = true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div ref={wrap} role="radiogroup" aria-label="Type" className="relative inline-flex min-w-0 items-center rounded-full bg-white/50 p-0.5 shadow-[inset_0_1px_2px_rgba(107,68,145,0.12)]">
      {box && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-full bg-lilac-500 shadow shadow-lilac-500/30"
          style={{ left: box.left, width: box.width, transition: settled.current ? 'left 0.34s cubic-bezier(0.34, 1.35, 0.55, 1), width 0.34s cubic-bezier(0.34, 1.35, 0.55, 1)' : 'none' }}
        />
      )}
      {KINDS.map((k, i) => (
        <span key={k.id} className="relative flex items-center">
          {i > 0 && <span aria-hidden className="h-3.5 w-px bg-ink-faint/25" />}
          <button
            type="button"
            role="radio"
            aria-checked={value === k.id}
            ref={(el) => {
              if (el) refs.current.set(k.id, el)
            }}
            onClick={() => onChange(k.id)}
            className={`relative rounded-full px-2.5 py-1 text-xs transition-colors duration-200 ${value === k.id ? 'text-white' : 'text-ink-soft hover:text-ink'}`}
          >
            {k.label}
          </button>
        </span>
      ))}
    </div>
  )
}

/** Centred quick-add: the one way to start a new item, from the New button, the N key, the water or a group's +. */
export function NewTask() {
  const { open, at, folderIds: startIn } = useCompose()
  const { mounted, closing } = useExit(open)
  const add = useStore((s) => s.addTask)
  const update = useStore((s) => s.updateTask)
  const discard = useStore((s) => s.discardDraft)
  const select = useStore((s) => s.select)
  const view = useStore((s) => s.view)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind | null>(null) // null = let what you type decide
  const [plain, setPlain] = useState(false) // "keep as typed": ignore dates, tags and repeats
  const [more, setMore] = useState(false) // the full details editor, opened in place
  const [draftId, setDraftId] = useState<string | null>(null)
  const draft = useStore((s) => (draftId ? s.tasks.find((t) => t.id === draftId) : undefined))
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const ref = useRef<HTMLInputElement>(null)
  const spot = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })
  const parsed = useMemo(() => (plain || more || !title.trim() ? null : parseQuickAdd(title, new Date(), { folders, people })), [title, plain, more, folders, people])
  const shownKind: TaskKind = draft?.kind ?? kind ?? parsed?.kind ?? 'task'

  // a task being set up in the full editor is real data (so every field works) but hidden until it is placed
  const dropDraft = () => {
    setDraftId((id) => {
      if (id) discard(id)
      return null
    })
  }
  useEffect(() => {
    if (open) {
      setTitle('')
      setKind(null)
      setPlain(false)
      setMore(false)
      spot.current = at ?? { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 }
      ref.current?.focus()
    } else dropDraft() // closed without placing it
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /** What the quick line understood, as the fields of a new task. */
  const fieldsFrom = (q: typeof parsed) => ({
    ...(q?.day ? { day: q.day } : {}),
    ...(q?.due ? { due: q.due } : {}),
    ...(q?.time ? { time: q.time } : {}),
    ...(q?.endTime ? { endTime: q.endTime } : {}),
    ...(q?.remindAt ? { remindAt: q.remindAt } : {}),
    ...(q?.repeat ? { repeat: q.repeat } : {}),
    ...(q?.folderIds.length || startIn?.length ? { folderIds: [...new Set([...(startIn ?? []), ...(q?.folderIds ?? [])])] } : {}),
    ...(q?.personIds.length ? { personIds: q.personIds } : {}),
  })

  const expand = () => {
    if (more) return setMore(false)
    if (!draftId) {
      const q = parsed
      setDraftId(add({ title: q?.title || title.trim(), kind: shownKind, ...spot.current, ...fieldsFrom(q), draft: true }))
    }
    setMore(true)
  }

  const finish = (id: string) => {
    closeCompose()
    // the pond ripples from the new bubble; elsewhere the new item opens for details
    if (view === 'pond') window.dispatchEvent(new CustomEvent('lilac:added', { detail: { id } }))
    else select(id)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return closeCompose()
    drop(0)
    if (draftId && draft) {
      update(draftId, { title: title.trim(), draft: false })
      if (draft.remindAt) void askNotify()
      const id = draftId
      setDraftId(null) // placed: closing must not throw it away
      return finish(id)
    }
    const q = parsed
    const id = add({ title: q?.title || title.trim(), kind: shownKind, ...spot.current, ...fieldsFrom(q) })
    if (q?.remindAt) void askNotify()
    finish(id)
  }

  if (!mounted) return null
  return (
    <div
      className={`fixed inset-0 z-[80] flex items-start justify-center bg-ink/10 px-4 backdrop-blur-[3px] transition-[opacity,padding] duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      style={{ paddingTop: more ? '0.75rem' : '18vh', paddingBottom: 'calc(var(--kb, 0px) + 0.75rem)' }}
      onClick={closeCompose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && closeCompose()}
        className={`glass glass-strong flex max-h-full w-full max-w-md flex-col rounded-[2rem] p-4 ${closing ? 'pop-out' : 'box-spring'}`}
      >
        {/* only the quick line is a form (Enter places it); the editor below has its own buttons */}
        <form onSubmit={submit}>
        <div className="flex items-center">
          <input
            ref={ref}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (draftId) update(draftId, { title: e.target.value })
            }}
            placeholder="Call Sarah tomorrow at 3pm…"
            className="well min-w-0 flex-1 rounded-2xl px-3.5 py-2 font-display text-xl placeholder:text-ink-faint"
          />
          <button type="button" onClick={closeCompose} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink" aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        {parsed && parsed.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
            {parsed.chips.map((c) => (
              <span key={c} className="rounded-full bg-lilac-100 px-2.5 py-0.5 text-xs text-lilac-700">
                {c}
              </span>
            ))}
            <button type="button" onClick={() => setPlain(true)} className="text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline">
              Keep as typed
            </button>
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2">
          <KindToggle
            value={shownKind}
            onChange={(k) => {
              setKind(k)
              if (draftId) update(draftId, { kind: k })
              ref.current?.focus() // keep typing
            }}
          />
          <button type="submit" className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-lilac-500 px-4 py-1.5 text-sm text-white shadow shadow-lilac-500/30">
            Place it
          </button>
        </div>
        </form>
        <button
          type="button"
          onClick={expand}
          aria-expanded={more}
          className="mt-2 flex items-center gap-1 self-start rounded-full px-2 py-1 text-xs text-ink-soft transition hover:bg-white/60 hover:text-ink"
        >
          <span className={`transition-transform ${more ? 'rotate-180' : ''}`}>
            <IconChevronDown size={13} />
          </span>
          {more ? 'Fewer details' : 'More details'}
        </button>
        {more && draft && (
          <div className="scroll-soft -mx-1 mt-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1 pt-2">
            <TaskFields task={draft} withKind={false} />
            <TagInput taskId={draft.id} />
          </div>
        )}
      </div>
    </div>
  )
}
