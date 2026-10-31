import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { authClient } from '../sync/auth'
import { pushProfile } from '../sync/connect'
import { useStore } from '../state/store'
import { Modal } from './dialogs'

const useVerify = create<{ open: boolean; email: string; then: 'signin' | 'stay' }>(() => ({ open: false, email: '', then: 'stay' }))

/** Ask for the code Neon Auth emailed. `then: 'signin'` is for a brand-new account, which can sign in once confirmed. */
export const openVerify = (email: string, then: 'signin' | 'stay' = 'stay') => useVerify.setState({ open: true, email, then })

/** Email a fresh confirmation code. */
export async function sendCode(email: string) {
  const res = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' })
  if (res?.error) throw new Error(res.error.message || 'Could not send the code.')
}

/** A plain reason for a refused code. */
const explain = (message?: string) => (/expired/i.test(message ?? '') ? 'That code has expired. Send a new one.' : 'That code isn’t right. Check it and try again.')

const field = 'well w-full rounded-xl px-3 py-2 text-center text-lg tracking-[0.3em]'

/** The code step of confirming an email address. */
export function VerifyDialog({ onSignIn }: { onSignIn: () => void }) {
  const { open, email, then } = useVerify()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const showToast = useStore((s) => s.showToast)
  useEffect(() => {
    if (open) {
      setCode('')
      setError('')
      setNote('')
    }
  }, [open])
  const close = () => useVerify.setState({ open: false })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await authClient.emailOtp.verifyEmail({ email, otp: code.trim() })
      if (res?.error) {
        setError(explain(res.error.message))
      } else {
        close()
        showToast('Email confirmed')
        // someone already signed in: pick the confirmation up straight away
        await authClient.getSession({ fetchOptions: { headers: { 'X-Force-Fetch': '1' } } }).catch(() => undefined)
        void pushProfile(true).catch(() => undefined)
        if (then === 'signin') onSignIn()
      }
    } catch (err) {
      // the client throws on a refused code too, so only a failed network call is a connection problem
      const msg = String((err as Error)?.message ?? '')
      setError(/failed to fetch|network|load failed|offline/i.test(msg) || navigator.onLine === false ? 'Couldn’t reach Lilac. Check your connection and try again.' : explain(msg))
    }
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      label="Confirm your email"
      footer={
        <button type="submit" form="verify-form" disabled={busy || code.trim().length < 4} className="w-full rounded-full bg-lilac-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 disabled:opacity-50">
          {busy ? 'Checking…' : 'Confirm'}
        </button>
      }
    >
      <form id="verify-form" onSubmit={submit} className="space-y-3">
        <h3 className="font-display text-xl">Confirm your email</h3>
        <p className="-mt-1 text-sm text-ink-soft">
          Enter the code we emailed to <span className="text-ink">{email}</span>.
        </p>
        <input className={field} inputMode="numeric" autoComplete="one-time-code" aria-label="Confirmation code" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} autoFocus />
        {error && (
          <p role="alert" className="rounded-xl bg-rose-soft/50 px-3 py-2 text-sm text-[#9a4566]">
            {error}
          </p>
        )}
        {note && (
          <p role="status" className="text-sm text-lilac-700">
            {note}
          </p>
        )}
        <p className="text-center text-sm text-ink-soft">
          Nothing arrived?{' '}
          <button
            type="button"
            className="font-medium text-lilac-700 underline-offset-2 hover:underline"
            onClick={async () => {
              setError('')
              try {
                await sendCode(email)
                setNote('A new code is on its way.')
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            Send a new code
          </button>
        </p>
      </form>
    </Modal>
  )
}
