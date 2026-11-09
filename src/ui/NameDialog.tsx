import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Modal } from './dialogs'

interface Spec {
  title: string
  label: string
  confirm: string
  resolve: (v: string | null) => void
}
const useName = create<{ spec: Spec | null }>(() => ({ spec: null }))

/** Ask for a name in a box that sits above the on-screen keyboard (editing in place under it would be hidden by it). */
export function askName(title: string, label = 'Name', confirm = 'Create'): Promise<string | null> {
  return new Promise((resolve) => {
    useName.getState().spec?.resolve(null)
    useName.setState({ spec: { title, label, confirm, resolve } })
  })
}

export function NameDialogHost() {
  const spec = useName((s) => s.spec)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (spec) {
      setValue('')
      window.setTimeout(() => input.current?.focus(), 80)
    }
  }, [spec])
  const done = (v: string | null) => {
    spec?.resolve(v && v.trim() ? v.trim() : null)
    useName.setState({ spec: null })
  }
  return (
    // (tapping outside keeps what was typed, as Enter would; Escape and Cancel throw it away)
    <Modal open={!!spec} onClose={() => done(null)} onDismiss={() => done(value)} label={spec?.title ?? 'Name'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          done(value)
        }}
        className="space-y-3"
      >
        <h3 className="font-display text-xl">{spec?.title}</h3>
        <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} aria-label={spec?.label} placeholder={spec?.label} enterKeyHint="done" autoCapitalize="sentences" className="well w-full rounded-xl px-3 py-2 text-base" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => done(null)} className="whitespace-nowrap rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-white/70">
            Cancel
          </button>
          <button type="submit" disabled={!value.trim()} className="whitespace-nowrap rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 disabled:opacity-40">
            {spec?.confirm}
          </button>
        </div>
      </form>
    </Modal>
  )
}
