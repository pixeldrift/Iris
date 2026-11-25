import { useState } from 'react'
import { create } from 'zustand'
import { sendFeedback } from '../sync/feedback'
import { useStore } from '../state/store'
import { Modal } from './dialogs'
import { SegmentedToggle } from './SegmentedToggle'

const useFeedback = create<{ open: boolean }>(() => ({ open: false }))
export const openFeedback = () => useFeedback.setState({ open: true })

const KINDS = [
  { id: 'bug' as const, label: 'Report a bug' },
  { id: 'idea' as const, label: 'Request a feature' },
]

/** "Report a bug or request a feature": a few words, and (if left on) the technical details that help find it. For people who are signed in. */
export function FeedbackHost() {
  const open = useFeedback((s) => s.open)
  const view = useStore((s) => s.view)
  const toast = useStore((s) => s.showToast)
  const [kind, setKind] = useState<'bug' | 'idea'>('bug')
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    useFeedback.setState({ open: false })
    setError(null)
  }
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || message.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      await sendFeedback({ kind, message: message.trim(), details, view: String(view) })
      setMessage('')
      close()
      toast(kind === 'bug' ? 'Thank you. The bug report is on its way.' : 'Thank you. Your idea is on its way.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sending failed. Try again later.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={close} label="Report a bug or request a feature">
      <form onSubmit={send} className="space-y-3">
        <h3 className="font-display text-xl">Tell us</h3>
        <SegmentedToggle label="What is it" value={kind} options={KINDS} onChange={setKind} />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label={kind === 'bug' ? 'What went wrong' : 'What would you like'}
          placeholder={kind === 'bug' ? 'What happened, and what did you expect?' : 'What would make Lilac better for you?'}
          rows={5}
          maxLength={4000}
          autoFocus
          className="well w-full resize-none rounded-xl px-3 py-2 text-base"
        />
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-lilac-500)]" />
          <span>
            Include technical details
            <span className="block text-xs text-ink-faint">your browser, screen size and the view you were on. Never your tasks, name or email.</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="whitespace-nowrap rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-white/70">
            Cancel
          </button>
          <button type="submit" disabled={busy || message.trim().length < 3} className="whitespace-nowrap rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 disabled:opacity-40">
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
