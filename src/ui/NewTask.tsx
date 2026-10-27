import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { drop } from '../audio/engine'
import { useExit } from './anim'
import { IconClose } from './icons'
import { KINDS } from './shared'
import type { TaskKind } from '../core/types'

/** Where a new item should land in the pond (fractions of the canvas); none = somewhere near the middle. */
interface ComposeState {
  open: boolean
  at: { x: number; y: number } | null
}
const useCompose = create<ComposeState>(() => ({ open: false, at: null }))
export const openCompose = (at: { x: number; y: number } | null = null) => useCompose.setState({ open: true, at })
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

/** Centred quick-add: the one way to start a new item, from the New button, the N key or the water. */
export function NewTask() {
  const { open, at } = useCompose()
  const { mounted, closing } = useExit(open)
  const add = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const view = useStore((s) => s.view)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('task')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setKind('task')
      ref.current?.focus()
    }
  }, [open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return closeCompose()
    drop(0)
    const pos = at ?? { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 }
    const id = add({ title: title.trim(), kind, ...pos })
    closeCompose()
    // the pond ripples from the new bubble; elsewhere the new item opens for details
    if (view === 'pond') window.dispatchEvent(new CustomEvent('lilac:added', { detail: { id } }))
    else select(id)
  }

  if (!mounted) return null
  return (
    <div className={`fixed inset-0 z-[80] flex items-start justify-center bg-ink/10 px-4 pt-[18vh] backdrop-blur-[3px] transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`} onClick={closeCompose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && closeCompose()} className={`glass glass-strong w-full max-w-md rounded-[2rem] p-4 ${closing ? 'pop-out' : 'box-spring'}`}>
        <div className="flex items-center">
          <input
            ref={ref}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A task, an idea, a list…"
            className="well min-w-0 flex-1 rounded-2xl px-3.5 py-2 font-display text-xl placeholder:text-ink-faint"
          />
          <button type="button" onClick={closeCompose} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink" aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <KindToggle
            value={kind}
            onChange={(k) => {
              setKind(k)
              ref.current?.focus() // keep typing
            }}
          />
          <button type="submit" className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-lilac-500 px-4 py-1.5 text-sm text-white shadow shadow-lilac-500/30">
            Place it
          </button>
        </div>
      </form>
    </div>
  )
}
