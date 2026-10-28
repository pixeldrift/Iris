import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { accountsConfigured, authClient } from '../sync/auth'
import { forgetAccountData, startSync, syncNow, useSync } from '../sync/engine'
import { askConfirm, Modal } from './dialogs'
import { IconGear, IconPerson, IconRepeat, IconSignOut } from './icons'
import { openPerson } from './PeopleDialogs'
import { Popover } from './Popover'
import { openSettings } from './SettingsDialog'
import { useStore } from '../state/store'

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
  const ensureMe = useStore((s) => s.ensureMe)
  useEffect(() => {
    // your own entry in the address book, made from your account (the same on every device)
    if (data?.user) ensureMe({ id: data.user.id, name: data.user.name, email: data.user.email })
  }, [data?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
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
          {mode === 'in' ? 'Sign in to bring your pond to this device.' : 'Your groups, tasks and people on this device are added to it, then kept in sync everywhere you sign in.'}
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
  if (accountsConfigured) return <AccountMenu />
  // no accounts here: settings still need a way in
  return (
    <button onClick={openSettings} aria-label="My settings" title="My settings" className="ml-auto grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-white/70">
      <IconGear size={16} />
    </button>
  )
}

function AccountMenu() {
  const { data } = authClient.useSession()
  const sync = useSync()
  const people = useStore((s) => s.people)
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  if (!data) {
    return (
      <span className="ml-auto flex items-center gap-1">
        <button onClick={openSettings} aria-label="My settings" title="My settings" className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-white/70">
          <IconGear size={16} />
        </button>
        <button onClick={() => openAuth('in')} className="rounded-full bg-white/60 px-3 py-1 text-xs text-ink-soft transition hover:bg-white" title="Keep your pond on every device">
          Sign in
        </button>
      </span>
    )
  }
  const status =
    sync.status === 'syncing' ? 'Syncing…' : sync.status === 'offline' ? 'Offline: saved on this device' : sync.status === 'error' ? 'Couldn’t sync. Tap Sync now to retry' : sync.lastAt ? `Synced ${ago(sync.lastAt)}` : 'Signed in'
  const dot = sync.status === 'error' ? 'bg-[#c95b88]' : sync.status === 'offline' ? 'bg-ink-faint' : sync.status === 'syncing' ? 'animate-pulse bg-lilac-400' : 'bg-[#6fc29a]'
  const me = people.find((p) => p.id === `me-${data.user.id}`)
  const initial = (data.user.name || data.user.email)[0]?.toUpperCase()
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-lilac-100/70'
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
        {initial}
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white/80 ${dot}`} />
      </button>
      <Popover open={menu} onClose={() => setMenu(false)} anchor={ref} align="end" className="w-60 p-1.5">
        <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lilac-200 text-base font-semibold text-lilac-700">{initial}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-tight">{data.user.name || data.user.email}</div>
            <div className="truncate text-xs text-ink-faint">{data.user.email}</div>
          </div>
        </div>
        <div className={`mx-2.5 mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/50 px-2 py-1 text-[0.7rem] ${sync.status === 'error' ? 'text-[#9a4566]' : 'text-ink-soft'}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0 flex-1 truncate">{status}</span>
          {sync.peers > 0 && sync.status !== 'error' && <span className="shrink-0 text-lilac-700">live</span>}
          <button
            onClick={() => void syncNow(data.user.id)}
            disabled={sync.status === 'syncing'}
            aria-label="Sync now"
            title="Sync now"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/80 hover:text-lilac-700"
          >
            <span className={`inline-grid ${sync.status === 'syncing' ? 'animate-spin' : ''}`}>
              <IconRepeat size={13} />
            </span>
          </button>
        </div>
        {sync.status === 'error' && sync.error && <div className="mx-2.5 mb-1.5 break-words rounded-lg bg-white/60 px-2 py-1 text-[0.7rem] text-ink-soft">{sync.error}</div>}
        {sync.peers > 0 && sync.status !== 'error' && <div className="mx-2.5 mb-1.5 text-[0.7rem] text-lilac-700">Also open on {sync.peers === 1 ? 'another device' : `${sync.peers} other devices`}</div>}
        <button
          className={item}
          onClick={() => {
            setMenu(false)
            if (me) openPerson({ id: me.id })
          }}
        >
          <IconPerson size={16} /> My details
        </button>
        <button
          className={item}
          onClick={() => {
            setMenu(false)
            openSettings()
          }}
        >
          <IconGear size={16} /> My settings
        </button>
        <div aria-hidden className="mx-2.5 my-1 h-px bg-ink-faint/20" />
        <button
          className={`${item} text-[#9a4566]`}
          onClick={async () => {
            setMenu(false)
            if (!(await askConfirm({ title: 'Sign out?', message: 'Your pond stays safe in your account. It is removed from this device until you sign in again.', confirmLabel: 'Sign out', cancelLabel: 'Stay signed in' }))) return
            await authClient.signOut()
            forgetAccountData()
          }}
        >
          <IconSignOut size={16} /> Sign out
        </button>
      </Popover>
    </>
  )
}
