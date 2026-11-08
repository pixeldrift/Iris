import { composeOpen } from '../audio/engine'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EXAMPLES, ExampleHint } from './ExampleHint'
import { SegmentedToggle } from './SegmentedToggle'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { drop } from '../audio/engine'
import { useExit } from './anim'
import { IconChevronDown, IconClose, IconImage, KindIcon } from './icons'
import { MenuItem, Popover } from './Popover'
import { TaskFields } from './TaskDetail'
import { KindHint, KINDS } from './shared'
import type { TaskKind } from '../core/types'
import { parseQuickAdd, suggestTags } from '../core/quickadd'
import { askNotify } from './notify'
import { notionImageFrom } from './photo'
import { useLandscapePhone } from './useMedia'

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


/** One exclusive pill: the highlight slides to whichever type is chosen, with a single soft overshoot. */
function KindToggle({ value, onChange }: { value: TaskKind; onChange: (k: TaskKind) => void }) {
  return <SegmentedToggle label="Type" value={value} options={KINDS} onChange={onChange} />
}

/** The type as a dropdown, for the sideways layout where a row of toggles would not fit beside the text. */
function KindMenu({ value, onChange }: { value: TaskKind; onChange: (k: TaskKind) => void }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const current = KINDS.find((k) => k.id === value)
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Type: ${current?.label}`}
        className="glass-soft flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-2.5 text-sm text-ink-soft transition hover:bg-white/70"
      >
        <KindIcon kind={value} size={15} />
        {current?.label}
        <span className="text-ink-faint">
          <IconChevronDown size={13} />
        </span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} className="!min-w-[9rem] p-1">
        {KINDS.map((k) => (
          <MenuItem
            key={k.id}
            active={k.id === value}
            onClick={() => {
              onChange(k.id)
              setOpen(false)
            }}
          >
            <span className="flex items-center gap-2">
              <KindIcon kind={k.id} size={15} />
              {k.label}
            </span>
          </MenuItem>
        ))}
      </Popover>
    </>
  )
}

/** Centred quick-add: the one way to start a new item, from the New button, the N key, the water or a group's +. */
export function NewTask() {
  const { open, at, preset } = useCompose()
  const land = useLandscapePhone()
  const startIn = preset?.folderIds
  const { mounted, closing } = useExit(open)
  const add = useStore((s) => s.addTask)
  const update = useStore((s) => s.updateTask)
  const discard = useStore((s) => s.discardDraft)
  const select = useStore((s) => s.select)
  const view = useStore((s) => s.view)
  useEffect(() => {
    if (open) composeOpen()
  }, [open])
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind | null>(null) // null = let what you type decide
  const [plain, setPlain] = useState(false) // "keep as typed": ignore dates, tags and repeats
  const mode = useStore((s) => s.settings.quickAdd)
  const [accepted, setAccepted] = useState(false) // in suggest-only mode: the person tapped "Use"
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
  // what it understands is applied ('auto'), applied only once accepted ('suggest'), or never tried ('off')
  const applying = mode === 'auto' ? !plain : mode === 'suggest' ? accepted : false
  const understood = useMemo(() => (mode === 'off' || more || !title.trim() ? null : parseQuickAdd(title, new Date(), { folders, people })), [title, mode, more, folders, people])
  const parsed = applying ? understood : null
  const suggested = mode === 'suggest' && !accepted && understood && understood.chips.length > 0 ? understood : null
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
    ...(q?.dueTime ? { dueTime: q.dueTime } : {}),
    ...(q?.time ? { time: q.time } : {}),
    ...(q?.endTime ? { endTime: q.endTime } : {}),
    ...(q?.remindAt ? { remindAt: q.remindAt } : {}),
    ...(q?.place ? { place: q.place } : {}),
    ...(q?.remindBefore ? { remindBefore: q.remindBefore } : {}),
    ...(q?.repeat ? { repeat: q.repeat } : {}),
    ...(q?.folderIds.length || startIn?.length ? { folderIds: [...new Set([...(startIn ?? []), ...(q?.folderIds ?? [])])] } : {}),
    ...(q?.personIds.length || preset?.personIds?.length ? { personIds: [...new Set([...(preset?.personIds ?? []), ...(q?.personIds ?? [])])] } : {}),
    ...(q?.tagOrder.length || startIn?.length || preset?.personIds?.length ? { tagOrder: [...new Set([...(startIn ?? []), ...(preset?.personIds ?? []), ...(q?.tagOrder ?? [])])] } : {}),
  })

  /** The item being made, as a draft the full editor works on (made now if it is not yet). */
  const ensureDraft = (): string => {
    if (draftId) return draftId
    const q = parsed
    const clean = q?.title || title.trim()
    const id = add({ title: clean, kind: shownKind, ...spot.current, ...fieldsFrom(q), draft: true })
    setDraftId(id)
    setTitle(clean) // what was understood (day, time, repeat...) now lives in the fields below, not in the line
    return id
  }
  const expand = () => {
    if (more) return setMore(false)
    ensureDraft()
    setMore(true)
  }
  // a photo is enough to make an item: it needs no title
  const photo = useRef<HTMLInputElement>(null)
  const takePhoto = async (file: File) => {
    try {
      const image = await notionImageFrom(file)
      update(ensureDraft(), { image })
      setMore(true)
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const deleteTask = useStore((s) => s.deleteTask)
  const showToast = useStore((s) => s.showToast)
  const finish = (id: string, quiet = false) => {
    closeCompose()
    // the pond ripples from the new bubble; elsewhere the new item opens for details (unless it was placed by closing the box)
    if (view === 'pond') window.dispatchEvent(new CustomEvent('lilac:added', { detail: { id } }))
    else if (!quiet) select(id)
  }

  /** Put the item in place. `quiet` is for closing the box without pressing Add: nothing opens, and a toast offers Undo. */
  const place = (quiet = false) => {
    if (!title.trim() && !draft?.image) return closeCompose()
    drop(0)
    const name = title.trim()
    const done = (id: string) => {
      // a due date typed into the box brings its reminder, like one chosen in the details
      const made = useStore.getState().tasks.find((x) => x.id === id)
      if (made?.due && made.kind !== 'idea') useStore.getState().setDue(id, made.due, made.dueTime ?? null)
      finish(id, quiet)
      if (quiet) showToast(name || parsed?.title ? `Added “${(parsed?.title || name).slice(0, 40)}”` : 'Added your picture', { label: 'Undo', run: () => deleteTask(id) })
    }
    if (draftId && draft) {
      update(draftId, { title: name, draft: false })
      if (draft.remindAt) void askNotify()
      const id = draftId
      setDraftId(null) // placed: closing must not throw it away
      return done(id)
    }
    const q = parsed
    const id = add({ title: q?.title || name, kind: shownKind, ...spot.current, ...fieldsFrom(q) })
    if (q?.remindAt) void askNotify()
    done(id)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    place()
  }

  /**
   * Clicking away by accident: whatever has a name is kept (a bubble is easy to delete; re-entering everything is not), and one
   * with no name simply closes. Escape, the × and Cancel are deliberate, and throw the item away.
   */
  const dismiss = () => place(true)

  // autocorrect for #groups and @people: the ones that exist, offered while the name is being typed (Tab takes the first)
  const sug = useMemo(() => (mode === 'off' ? [] : suggestTags(title, { folders, people })), [title, mode, folders, people])
  const take = (text: string) => {
    setTitle(text)
    if (draftId) update(draftId, { title: text })
    ref.current?.focus()
  }
  const suggest = sug.length > 0 && (
    <div role="listbox" aria-label="Suggestions" className="glass glass-strong absolute inset-x-0 top-full z-30 mt-1 rounded-2xl p-1.5 shadow-xl">
      {sug.map((s, i) => (
        <button key={s.label} type="button" role="option" aria-selected={i === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => take(s.text)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition hover:bg-lilac-100/80 ${i === 0 ? 'bg-lilac-100/60' : ''}`}>
          <span className="truncate">{s.label}</span>
          {i === 0 && <span className="ml-auto text-[0.65rem] text-ink-faint">Tab</span>}
        </button>
      ))}
    </div>
  )

  const changeKind = (k: TaskKind) => {
    setKind(k)
    if (draftId) update(draftId, { kind: k })
    ref.current?.focus() // keep typing
  }

  if (!mounted) return null
  return (
    <div
      className={`fixed inset-0 z-[80] flex items-start justify-center bg-ink/10 backdrop-blur-[3px] transition-[opacity,padding] duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      // a phone turned sideways has little height and the keyboard takes most of it: the box starts near the top there
      style={{ paddingTop: more || land ? '0.5rem' : '18vh', paddingBottom: 'calc(var(--kb, 0px) + 0.75rem)', paddingLeft: 'max(1rem, var(--safe-l))', paddingRight: 'max(1rem, var(--safe-r))' }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeCompose()
          else if (e.key === 'Tab' && !e.shiftKey && sug.length && e.target === ref.current) {
            e.preventDefault()
            take(sug[0].text)
          }
        }}
        className={`glass glass-strong relative flex max-h-full w-full flex-col ${land ? 'max-w-3xl rounded-[1.5rem] p-3' : 'max-w-md rounded-[2rem] p-4'} ${closing ? 'pop-out' : 'box-spring'}`}
      >
        <input ref={photo} type="file" accept="image/*" hidden aria-label="Choose a photo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void takePhoto(f) }} />
        {land ? (
          // turned sideways, with the keyboard up, a second row would fall below the box: one row, the type a dropdown, Add at the far right
          <>
            <form id="new-form" onSubmit={submit} className="flex items-center gap-2 pr-9">
              <div className="relative min-w-0 flex-1">
                <input
                  ref={ref}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    if (draftId) update(draftId, { title: e.target.value })
                  }}
                  aria-label="New item"
                  data-proxy-commit
                  className="well w-full rounded-2xl px-3.5 py-1.5 font-display text-lg"
                />
                {!title && <ExampleHint index={hint} className="left-3.5 right-3 font-display text-lg" />}
                {suggest}
              </div>
              <KindMenu value={shownKind} onChange={changeKind} />
              <button type="button" onClick={() => photo.current?.click()} aria-label="Add a picture" title="Add a picture (it can be the whole reminder)" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/60 hover:text-ink">
                <IconImage size={17} />
              </button>
                            <button
                type="button"
                onClick={expand}
                aria-expanded={more}
                aria-label={more ? 'Fewer details' : 'More details'}
                title={more ? 'Fewer details' : 'More details'}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/60 hover:text-ink"
              >
                <span className={`transition-transform ${more ? 'rotate-180' : ''}`}>
                  <IconChevronDown size={15} />
                </span>
              </button>
              {!(more && draft) && (
                <button type="submit" className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-lilac-500 px-4 py-1.5 text-sm text-white shadow shadow-lilac-500/30">
                  + Add
                </button>
              )}
            </form>
            <button type="button" onClick={closeCompose} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink" aria-label="Close">
              <IconClose size={15} />
            </button>
          </>
        ) : (
          <>
        {/* only the quick line is a form (Enter places it); the editor below has its own buttons */}
        <form id="new-form" onSubmit={submit}>
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
                  data-proxy-commit
              className="well w-full rounded-2xl px-3.5 py-2 font-display text-xl"
            />
            {!title && (
              <ExampleHint index={hint} className="left-3.5 right-3 font-display text-xl" />
            )}
            {suggest}
          </div>
          <button type="button" onClick={closeCompose} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink" aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        {suggested && (
          // suggest-only: nothing is applied until it is tapped, so there is nothing to undo
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
            <span className="text-xs text-ink-faint">Suggested:</span>
            {suggested.chips.map((c) => (
              <span key={c} className="rounded-full border border-dashed border-lilac-300 px-2.5 py-0.5 text-xs text-ink-soft">
                {c}
              </span>
            ))}
            <button type="button" onClick={() => (setAccepted(true), ref.current?.focus())} className="rounded-full bg-lilac-100 px-2.5 py-0.5 text-xs font-medium text-lilac-700 transition hover:bg-lilac-200">
              Use
            </button>
          </div>
        )}
        {parsed && parsed.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
            {parsed.chips.map((c) => (
              <span key={c} className="chip-bubble rounded-full px-2.5 py-0.5 text-xs">
                {c}
              </span>
            ))}
            <button type="button" onClick={() => (mode === 'suggest' ? setAccepted(false) : setPlain(true))} className="text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline">
              Keep as typed
            </button>
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2">
          <KindToggle value={shownKind} onChange={changeKind} />
          <button type="button" onClick={() => photo.current?.click()} aria-label="Add a picture" title="Add a picture (it can be the whole reminder)" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/60 hover:text-ink">
            <IconImage size={17} />
          </button>
                    {/* expanded: Cancel and Add live in a bar pinned to the bottom instead */}
          {!(more && draft) && (
            <button type="submit" className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-lilac-500 px-4 py-1.5 text-sm text-white shadow shadow-lilac-500/30">
              + Add
            </button>
          )}
        </div>
        </form>
        {/* what this kind of item is on the left; the full editor's toggle on the right, under the Add button */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="min-w-0 flex-1 px-1">
            <KindHint kind={shownKind} />
          </div>
          <button
            type="button"
            onClick={expand}
            aria-expanded={more}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-soft transition hover:bg-white/60 hover:text-ink"
          >
            {more ? 'Fewer details' : 'More details'}
            <span className={`transition-transform ${more ? 'rotate-180' : ''}`}>
              <IconChevronDown size={13} />
            </span>
          </button>
        </div>
          </>
        )}
        {more && draft && (
          <div className="scroll-soft -mx-1 mt-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pt-2" style={{ paddingBottom: 'calc(var(--kb, 0px) * 0.5)' }}>
            <TaskFields task={draft} withKind={false} />
          </div>
        )}
        {more && draft && (
          <div className="-mx-4 -mb-4 flex shrink-0 items-center gap-2 border-t border-white/60 px-4 py-3">
            <button type="button" onClick={closeCompose} className="ml-auto rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-white/70">
              Cancel
            </button>
            <button type="submit" form="new-form" className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30">
              + Add
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
