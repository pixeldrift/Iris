import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { drop } from '../audio/engine'
import { useExit } from './anim'
import { IconClose } from './icons'
import { KINDS } from './shared'
import type { TaskKind } from '../core/types'

/** Centered quick-add, for views without a free canvas. */
export function NewTask({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mounted, closing } = useExit(open)
  const add = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('task')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      ref.current?.focus()
    }
  }, [open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return onClose()
    drop(0)
    const id = add({ title: title.trim(), kind, x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 })
    onClose()
    select(id)
  }

  if (!mounted) return null
  return (
    <div className={`fixed inset-0 z-[80] grid place-items-start justify-items-center bg-ink/10 px-4 pt-[18vh] backdrop-blur-[3px] transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()} className={`glass glass-strong w-full max-w-md rounded-[2rem] p-4 ${closing ? 'pop-out' : 'pop-in'}`}>
        <div className="flex items-center">
          <input
            ref={ref}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A task, an idea, a list…"
            className="well min-w-0 flex-1 rounded-2xl px-3.5 py-2 font-display text-xl placeholder:text-ink-faint"
          />
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink" aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {KINDS.map((k) => (
            <button
              type="button"
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-full px-3 py-1 text-xs transition ${kind === k.id ? 'bg-lilac-500 text-white' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
            >
              {k.label}
            </button>
          ))}
          <button type="submit" className="ml-auto rounded-full bg-lilac-500 px-4 py-1.5 text-sm text-white shadow shadow-lilac-500/30">
            Plant it
          </button>
        </div>
      </form>
    </div>
  )
}
