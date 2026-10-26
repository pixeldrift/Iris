import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { drop } from '../audio/engine'
import { KINDS } from './shared'
import type { TaskKind } from '../core/types'

/** Centered quick-add, for views without a free canvas. */
export function NewTask({ onClose }: { onClose: () => void }) {
  const add = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('task')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return onClose()
    drop(0)
    const id = add({ title: title.trim(), kind, x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 })
    onClose()
    select(id)
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-start justify-items-center bg-ink/10 px-4 pt-[18vh] backdrop-blur-[3px]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()} className="glass bloom-in w-full max-w-md rounded-[2rem] p-4">
        <input
          ref={ref}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A task, an idea, a reminder…"
          className="w-full bg-transparent px-2 py-2 font-display text-xl outline-none placeholder:text-ink-faint"
        />
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
