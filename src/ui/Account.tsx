import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { accountsConfigured, authClient } from '../sync/auth'
import { forgetAccountData, startSync, syncNow, useSync } from '../sync/engine'
import { askConfirm, Modal } from './dialogs'
import { Popover } from './Popover'

const useAuthDialog = create<{ open: boolean; mode: 'in' | 'up' }>(() => ({ open: false, mode: 'in' }))
export const openAuth = (mode: 'in' | 'up' = 'in') => useAuthDialog.setState({ open: true, mode })
const closeAuth = () => useAuthDialog.setState({ open: false })

/** Starts and stops syncing as someone signs in and out, and hosts the sign-in dialog. */
export function AccountHost() {
  return accountsConfigured ? <AccountSync /> : null
}

function AccountSync() {
  const { data } = authClient.useSession()
  const userId = data?.user.id ?? null
  useEffect(() => (userId ? startSync(userId) : undefined), [userId])
  return <AuthDialog />
}

const field = 'well w-full rounded-xl px-3 py-2 text-sm'

function AuthDialog() {
  const { open, mode } = useAuthDialog()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setError('')
      setPassword('')
    }
  }, [open, mode])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res =
        mode === 'in'
          ? await authClient.signIn.email({ email: email.trim(), password })
          : await authClient.signUp.email({ name: name.trim() || email.split('@')[0], email: email.trim(), password })
      if (res.error) setError(res.error.message || 'Something went wrong. Try again.')
      else closeAuth()
    } catch {
      setError('Couldn’t reach Lilac. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={closeAuth} label={mode === 'in' ? 'Sign in' : 'Create account'}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="font-display text-xl">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h3>
        <p className="-mt-1 text-xs text-ink-soft">
          {mode === 'in' ? 'Sign in to bring your pond to this device.' : 'Your folders, tasks and people on this device are added to it, then kept in sync everywhere you sign in.'}
        </p>
        {mode === 'up' && <input className={field} placeholder="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        <input className={field} type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <input
          className={field}
          type="password"
          required
          minLength={8}
          placeholder={mode === 'in' ? 'Password' : 'Password (8 or more characters)'}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-xl bg-rose-soft/50 px-3 py-2 text-sm text-[#9a4566]">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full rounded-full bg-lilac-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 disabled:opacity-50">
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <p className="text-center text-sm text-ink-soft">
          {mode === 'in' ? 'New here? ' : 'Already have an account? '}
          <button type="button" onClick={() => openAuth(mode === 'in' ? 'up' : 'in')} className="text-lilac-700 underline-offset-2 hover:underline">
            {mode === 'in' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </Modal>
  )
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}

/** Top-right of the sidebar, opposite the logo: sign in, or your avatar with a sync dot and a small menu. */
export function AccountRow() {
  return accountsConfigured ? <AccountMenu /> : null
}

function AccountMenu() {
  const { data } = authClient.useSession()
  const sync = useSync()
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  if (!data) {
    return (
      <button onClick={() => openAuth('in')} className="ml-auto rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft transition hover:bg-white" title="Keep your pond on every device">
        Sign in
      </button>
    )
  }
  const status =
    sync.status === 'syncing' ? 'Syncing…' : sync.status === 'offline' ? 'Offline: saved on this device' : sync.status === 'error' ? 'Couldn’t sync. Tap Sync now to retry' : sync.lastAt ? `Synced ${ago(sync.lastAt)}` : 'Signed in'
  const dot = sync.status === 'error' ? 'bg-[#c95b88]' : sync.status === 'offline' ? 'bg-ink-faint' : sync.status === 'syncing' ? 'animate-pulse bg-lilac-400' : 'bg-[#6fc29a]'
  return (
    <>
      <button
        ref={ref}
        onClick={() => setMenu((m) => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={`Account: ${data.user.name || data.user.email}. ${status}`}
        className="relative ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-200 text-sm font-semibold text-lilac-700 transition hover:scale-105"
      >
        {(data.user.name || data.user.email)[0]?.toUpperCase()}
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white/80 ${dot}`} />
      </button>
      <Popover open={menu} onClose={() => setMenu(false)} anchor={ref} align="end" className="w-64 p-1.5">
        <div className="px-3 py-1.5">
          <div className="truncate text-sm">{data.user.name || data.user.email}</div>
          <div className="truncate text-xs text-ink-faint">{data.user.email}</div>
          <div className={`mt-1 text-xs ${sync.status === 'error' ? 'text-[#9a4566]' : 'text-ink-soft'}`}>{status}</div>
        </div>
        <button
          onClick={() => {
            setMenu(false)
            void syncNow(data.user.id)
          }}
          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-lilac-100/70"
        >
          Sync now
        </button>
        <button
          onClick={async () => {
            setMenu(false)
            if (!(await askConfirm({ title: 'Sign out?', message: 'Your pond stays safe in your account. It is removed from this device until you sign in again.', confirmLabel: 'Sign out', cancelLabel: 'Stay signed in' }))) return
            await authClient.signOut()
            forgetAccountData()
          }}
          className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#9a4566] hover:bg-lilac-100/70"
        >
          Sign out
        </button>
      </Popover>
    </>
  )
}
