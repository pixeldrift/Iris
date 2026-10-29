import { useState } from 'react'
import { create } from 'zustand'
import { accountsConfigured, authClient } from '../sync/auth'
import { deleteMyAccount, reauthenticate } from '../sync/account'
import { useStore } from '../state/store'
import { Modal } from './dialogs'

type Kind = 'clear' | 'delete'
const useDanger = create<{ kind: Kind | null }>(() => ({ kind: null }))
export const openDanger = (kind: Kind) => useDanger.setState({ kind })
const close = () => useDanger.setState({ kind: null })

const field = 'well w-full rounded-xl px-3 py-2 text-sm'
const PHRASE = 'DELETE'

const COPY: Record<Kind, { title: string; what: string; button: string }> = {
  clear: {
    title: 'Clear everything and start fresh?',
    what: 'Every task, group and person is deleted from this device, and from your account on all your other devices. Your settings and your own profile stay. This can’t be undone.',
    button: 'Clear everything',
  },
  delete: {
    title: 'Delete your account?',
    what: 'Your account, your login and everything saved in it are permanently deleted from our server. This device goes back to the starter data. This can’t be undone.',
    button: 'Delete my account',
  },
}

/** The two destructive actions: each asks you to type your email and password again (or a word, when there is no account). */
export function DangerHost() {
  const kind = useDanger((s) => s.kind)
  // keep the wording while the dialog fades out
  const [last, setLast] = useState<Kind>('clear')
  if (kind && kind !== last) setLast(kind)
  const copy = COPY[kind ?? last]
  return (
    <Modal open={kind !== null} onClose={close} label={copy.title}>
      {kind && (accountsConfigured ? <WithAccount kind={kind} /> : <Plain kind={kind} />)}
    </Modal>
  )
}

function Shell({ kind, ready, busy, error, onConfirm, children }: { kind: Kind; ready: boolean; busy: boolean; error: string; onConfirm: () => void; children: React.ReactNode }) {
  const copy = COPY[kind]
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !busy) onConfirm()
      }}
    >
      <h3 className="font-display text-xl">{copy.title}</h3>
      <p className="text-sm text-ink-soft">{copy.what}</p>
      {children}
      {error && (
        <p role="alert" className="rounded-xl bg-rose-soft/50 px-3 py-2 text-sm text-[#9a4566]">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={close} className="ml-auto rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-white/70">
          Keep everything
        </button>
        <button type="submit" disabled={!ready || busy} className="rounded-full bg-[#c4577e] px-5 py-2 text-sm font-medium text-white shadow-md shadow-[#c4577e]/30 transition disabled:opacity-40">
          {busy ? 'One moment…' : copy.button}
        </button>
      </div>
    </form>
  )
}

/** Signed in: type the account's email and password again. */
function WithAccount({ kind }: { kind: Kind }) {
  const { data } = authClient.useSession()
  const account = data?.user.email ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!data) return <Plain kind={kind} needsAccount />
  const ready = email.trim().toLowerCase() === account.toLowerCase() && password.length > 0
  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await reauthenticate(email.trim(), password)
      if (kind === 'clear') useStore.getState().clearEverything()
      else await deleteMyAccount()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell kind={kind} ready={ready} busy={busy} error={error} onConfirm={confirm}>
      <input className={field} type="email" placeholder="Type your email to confirm" aria-label="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={field} type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
    </Shell>
  )
}

/** No account on this device: clearing is local, so the confirmation is typing a word. (Deleting an account needs one.) */
function Plain({ kind, needsAccount = false }: { kind: Kind; needsAccount?: boolean }) {
  const [word, setWord] = useState('')
  if (kind === 'delete' || needsAccount) {
    return (
      <div className="space-y-3">
        <h3 className="font-display text-xl">No account to delete</h3>
        <p className="text-sm text-ink-soft">You’re not signed in on this device. Sign in first, then delete the account.</p>
        <div className="flex justify-end">
          <button type="button" onClick={close} className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white">
            OK
          </button>
        </div>
      </div>
    )
  }
  return (
    <Shell
      kind={kind}
      ready={word.trim() === PHRASE}
      busy={false}
      error=""
      onConfirm={() => {
        useStore.getState().clearEverything()
        close()
      }}
    >
      <input className={field} placeholder={`Type ${PHRASE} to confirm`} aria-label="Confirmation word" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
    </Shell>
  )
}
