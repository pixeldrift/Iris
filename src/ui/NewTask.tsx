import { useEffect, useMemo, useRef, useState } from 'react'
import { SegmentedToggle } from './SegmentedToggle'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { drop } from '../audio/engine'
import { useExit } from './anim'
import { IconChevronDown, IconClose } from './icons'
import { TagInput } from './TagInput'
import { TaskFields } from './TaskDetail'
import { KindHint, KINDS } from './shared'
import type { TaskKind } from '../core/types'
import { parseQuickAdd } from '../core/quickadd'
import { askNotify } from './notify'

/** Where a new item should land in the pond (fractions of the canvas); none = somewhere near the middle. */
interface ComposeState {
  open: boolean
  at: { x: number; y: number } | null
  /** What the new item starts with (from the + beside a group, person or type). */
  preset: ComposePreset | null
}
export interface ComposePreset {
  folderIds?: string[]
  personIds?: string[]
  kind?: TaskKind
}
const useCompose = create<ComposeState>(() => ({ open: false, at: null, preset: null }))
export const openCompose = (at: { x: number; y: number } | null = null, preset: ComposePreset | null = null) => useCompose.setState({ open: true, at, preset })
const closeCompose = () => useCompose.setState({ open: false })

/** Things the line understands, shown one at a time as faded hints (each one a different kind of detail). */
const EXAMPLES = [
  'ex. Return library books',
  'ex. Dentist friday at 2:30pm',
  'ex. Yoga every mon/wed/fri 7am',
  'ex. Remind me to call Mom at 5pm',
  'ex. Pay rent every month on the 1st',
  'ex. Study group tomorrow 3-4:30pm',
  'ex. Birthday gift for Mom by oct 31',
  'ex. Water the plants every 2 weeks',
  'ex. idea: a poem about rain',
]

/** One exclusive pill: the highlight slides to whichever type is chosen, with a single soft overshoot. */
function KindToggle({ value, onChange }: { value: TaskKind; onChange: (k: TaskKind) => void }) {
  return <SegmentedToggle label="Type" value={value} options={KINDS} onChange={onChange} />
}

/** Centred quick-add: the one way to start a new item, from the New button, the N key, the water or a group's +. */
export function NewTask() {
  const { open, at, preset } = useCompose()
  const startIn = preset?.folderIds
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
  const [hint, setHint] = useState(0)
  useEffect(() => {
    if (!open) return
    setHint(Math.floor(Math.random() * EXAMPLES.length)) // a different one each time it opens
    const t = window.setInterval(() => setHint((h) => h + 1), 3600)
    return () => window.clearInterval(t)
  }, [open])
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
      setKind(preset?.kind ?? null)
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
    ...(q?.personIds.length || preset?.personIds?.length ? { personIds: [...new Set([...(preset?.personIds ?? []), ...(q?.personIds ?? [])])] } : {}),
  })

  const expand = () => {
    if (more) return setMore(false)
    if (!draftId) {
      const q = parsed
      const clean = q?.title || title.trim()
      setDraftId(add({ title: clean, kind: shownKind, ...spot.current, ...fieldsFrom(q), draft: true }))
      setTitle(clean) // what was understood (day, time, repeat...) now lives in the fields below, not in the line
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
          <div className="relative min-w-0 flex-1">
            <input
              ref={ref}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (draftId) update(draftId, { title: e.target.value })
              }}
              aria-label="New item"
              className="well w-full rounded-2xl px-3.5 py-2 font-display text-xl"
            />
            {!title && (
              <span key={hint} aria-hidden className="hint-swap pointer-events-none absolute inset-y-0 left-3.5 right-3 flex items-center truncate font-display text-xl italic text-ink-faint/50">
                {EXAMPLES[hint % EXAMPLES.length]}
              </span>
            )}
          </div>
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
            + Add
          </button>
        </div>
        </form>
        <KindHint kind={shownKind} className="mt-1.5 px-1" />
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
