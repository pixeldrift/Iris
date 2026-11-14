import { useEffect, useState } from 'react'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { IconCopy, IconPencil } from './icons'
import { Tip } from './Tip'

/** Puts text on the clipboard (the modern way where it is allowed, an off-screen text box where it is not). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const box = document.createElement('textarea')
    box.value = text
    box.setAttribute('readonly', '')
    Object.assign(box.style, { position: 'fixed', top: '0', left: '0', opacity: '0' })
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand('copy')
    box.remove()
    return ok
  }
}

/**
 * A task's notes: plain text once they are written (tap them to edit again), with a Copy button, which is surer than selecting text on a
 * phone. With nothing written yet it is the text box straight away (not focused, so opening an item never raises the keyboard).
 */
export function NotesField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const showToast = useStore((s) => s.showToast)
  const [editing, setEditing] = useState(() => !task.notes)
  const [chosen, setChosen] = useState(false) // (editing was asked for: then it takes the focus)
  useEffect(() => {
    setEditing(!task.notes)
    setChosen(false)
  }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const edit = () => {
    setChosen(true)
    setEditing(true)
  }

  if (editing || !task.notes) {
    return (
      <textarea
        autoFocus={chosen}
        value={task.notes}
        onChange={(e) => update(task.id, { notes: e.target.value })}
        onBlur={() => task.notes && setEditing(false)}
        placeholder="Write a note…"
        aria-label="Notes"
        rows={Math.min(8, Math.max(3, Math.ceil(task.notes.length / 40) + (task.notes.match(/\n/g)?.length ?? 0)))}
        className="well w-full resize-none rounded-2xl px-3.5 py-2.5 text-sm"
      />
    )
  }
  return (
    <div className="flex items-start gap-1">
      <p onClick={edit} className="select-text min-w-0 flex-1 cursor-text whitespace-pre-wrap break-words rounded-xl px-1 py-1 text-sm leading-relaxed text-ink">
        {task.notes}
      </p>
      <Tip label="Copy the notes">
        <button type="button" aria-label="Copy notes" onClick={async () => showToast((await copyText(task.notes)) ? 'Notes copied.' : 'Could not copy the notes.')} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-lilac-700">
          <IconCopy size={14} />
        </button>
      </Tip>
      <Tip label="Edit the notes">
        <button type="button" aria-label="Edit notes" onClick={edit} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-lilac-700">
          <IconPencil size={14} />
        </button>
      </Tip>
    </div>
  )
}
