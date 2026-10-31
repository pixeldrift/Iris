import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { DEFAULT_SHARES, detailsOf, SHARE_FIELDS } from '../core/linking'
import type { Person } from '../core/types'
import { acceptRequest, declineRequest, disconnectFrom, markNoticesRead, sendInvite, setMyShares, useConnect, type Connection } from '../sync/connect'
import { useStore } from '../state/store'
import { askConfirm, Modal } from './dialogs'
import { IconLink } from './icons'

interface Open {
  invite: Person | null
  accept: Connection | null
  shares: Person | null
  notices: boolean
}
const useOpen = create<Open>(() => ({ invite: null, accept: null, shares: null, notices: false }))
export const openInvite = (person: Person) => useOpen.setState({ invite: person })
export const openShares = (person: Person) => useOpen.setState({ shares: person })
export const openNotices = () => useOpen.setState({ notices: true })

/** The last non-empty value, so a dialog keeps its words while it fades out. */
function useLast<T>(v: T | null): T | null {
  const ref = useRef<T | null>(v)
  if (v) ref.current = v
  return v ?? ref.current
}

const btnGhost = 'rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-white/70'
const btnMain = 'rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 disabled:opacity-40'

/** What you could share, as checkboxes, each showing the detail it would send. */
function ShareChoices({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const me = useStore((s) => s.people.find((p) => p.isMe))
  const d = me ? detailsOf(me) : {}
  const shown = (id: string) => (id === 'name' ? [d.first, d.last].filter(Boolean).join(' ') : id === 'address' ? d.address : d[id])
  return (
    <div className="space-y-1" role="group" aria-label="What to share">
      {SHARE_FIELDS.map((f) => {
        const on = value.includes(f.id)
        return (
          <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm transition hover:bg-white/60">
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== f.id) : [...value, f.id])} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
            <span className="w-16 shrink-0 text-ink">{f.label}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">{shown(f.id) || 'not set in your profile'}</span>
          </label>
        )
      })}
    </div>
  )
}

function InviteDialog() {
  const live = useOpen((s) => s.invite)
  const person = useLast(live)
  const [shares, setShares] = useState<string[]>(DEFAULT_SHARES)
  const [busy, setBusy] = useState(false)
  const showToast = useStore((s) => s.showToast)
  useEffect(() => {
    if (person) setShares(DEFAULT_SHARES)
  }, [person?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => useOpen.setState({ invite: null })
  const later = () => {
    // not now: don't ask again for this address (the invitation can still be sent from their details)
    if (person) useStore.getState().savePerson({ id: person.id, name: person.name, invited: person.email.trim().toLowerCase() })
    close()
  }
  return (
    <Modal
      open={!!live}
      onClose={later}
      label="Invite to connect"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={later} className={btnGhost}>
            Not now
          </button>
          <button
            type="button"
            disabled={busy}
            className={btnMain}
            onClick={async () => {
              if (!person) return
              setBusy(true)
              try {
                await sendInvite(person, shares)
                showToast('Invitation sent. If they use Lilac, they’ll get your request.')
                close()
              } catch (e) {
                showToast((e as Error).message)
              }
              setBusy(false)
            }}
          >
            Send invitation
          </button>
        </div>
      }
    >
      <h3 className="font-display text-xl">Invite {person?.name} to connect?</h3>
      <p className="mt-1.5 text-sm text-ink-soft">If they use Lilac, they’ll get your request and can choose what to share back, so their details fill in on their own.</p>
      <p className="mb-2 mt-3 text-xs font-medium text-ink-soft">What would you share with them?</p>
      <ShareChoices value={shares} onChange={setShares} />
    </Modal>
  )
}

function AcceptDialog() {
  const liveC = useOpen((s) => s.accept)
  const c = useLast(liveC)
  const [shares, setShares] = useState<string[]>(DEFAULT_SHARES)
  const [busy, setBusy] = useState(false)
  const showToast = useStore((s) => s.showToast)
  useEffect(() => {
    if (c) setShares(DEFAULT_SHARES)
  }, [c?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => useOpen.setState({ accept: null })
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await fn()
      showToast(done)
      close()
    } catch (e) {
      showToast((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <Modal
      open={!!liveC}
      onClose={close}
      label="Connection request"
      footer={
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy} className="rounded-full px-3 py-2 text-sm text-ink-faint transition hover:text-[#b04a6e]" onClick={() => c && run(() => declineRequest(c, true), 'Blocked. They won’t be told.')}>
            Block
          </button>
          <button type="button" disabled={busy} className={`${btnGhost} ml-auto`} onClick={() => c && run(() => declineRequest(c), 'Declined. They won’t be told.')}>
            Decline
          </button>
          <button type="button" disabled={busy} className={btnMain} onClick={() => c && run(() => acceptRequest(c, shares), `Connected with ${c.name}`)}>
            Accept
          </button>
        </div>
      }
    >
      <h3 className="font-display text-xl">{c?.name} wants to connect</h3>
      <p className="mt-1.5 text-sm text-ink-soft">
        {c?.email && <span className="text-ink">{c.email}</span>} If you accept, the details they share appear in your address book and stay up to date.
      </p>
      <p className="mb-2 mt-3 text-xs font-medium text-ink-soft">What would you share with them?</p>
      <ShareChoices value={shares} onChange={setShares} />
    </Modal>
  )
}

function SharesDialog() {
  const livePerson = useOpen((s) => s.shares)
  const person = useLast(livePerson)
  const conn = useConnect((s) => s.connections.find((c) => c.userId === person?.link?.userId && c.status === 'accepted'))
  const [shares, setShares] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const showToast = useStore((s) => s.showToast)
  useEffect(() => {
    if (person) setShares(conn?.myShares ?? [])
  }, [person?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => useOpen.setState({ shares: null })
  return (
    <Modal
      open={!!livePerson}
      onClose={close}
      label="Sharing"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-2 text-sm text-ink-faint transition hover:text-[#b04a6e]"
            onClick={async () => {
              if (!conn || !person) return
              if (!(await askConfirm({ title: `Disconnect from ${person.name}?`, message: 'What they shared is removed from their entry; the entry itself stays. You can connect again later.', confirmLabel: 'Disconnect', danger: true }))) return
              try {
                await disconnectFrom(conn.id)
                close()
              } catch (e) {
                showToast((e as Error).message)
              }
            }}
          >
            Disconnect
          </button>
          <button type="button" className={`${btnGhost} ml-auto`} onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !conn}
            className={btnMain}
            onClick={async () => {
              if (!conn) return
              setBusy(true)
              try {
                await setMyShares(conn.id, shares)
                close()
              } catch (e) {
                showToast((e as Error).message)
              }
              setBusy(false)
            }}
          >
            Save
          </button>
        </div>
      }
    >
      <h3 className="flex items-center gap-2 font-display text-xl">
        <span className="text-lilac-500">
          <IconLink size={18} />
        </span>
        Sharing with {person?.name}
      </h3>
      <p className="mb-2 mt-1.5 text-sm text-ink-soft">What {person?.first || person?.name} can see of your details. Changes apply straight away.</p>
      <ShareChoices value={shares} onChange={setShares} />
    </Modal>
  )
}

function NoticesDialog() {
  const open = useOpen((s) => s.notices)
  const { notices, connections } = useConnect()
  const close = () => useOpen.setState({ notices: false })
  useEffect(() => {
    // looking at the news reads the ones that are only news; requests stay until you answer them
    if (!open) return
    const ids = notices.filter((n) => !n.read && n.kind === 'accepted').map((n) => n.id)
    if (ids.length) void markNoticesRead(ids).catch(() => undefined)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = connections.filter((c) => c.status === 'pending-in')
  const news = notices.filter((n) => n.kind === 'accepted').slice(0, 10)
  return (
    <Modal open={open} onClose={close} label="Notifications">
      <h3 className="font-display text-xl">Notifications</h3>
      <div className="mt-3 space-y-2">
        {waiting.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.name} wants to connect</div>
              <div className="truncate text-xs text-ink-faint">{c.email}</div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full bg-lilac-500 px-3.5 py-1.5 text-xs font-medium text-white shadow shadow-lilac-500/30 transition hover:bg-lilac-600"
              onClick={() => {
                close()
                useOpen.setState({ accept: c })
              }}
            >
              Review
            </button>
          </div>
        ))}
        {news.map((n) => (
          <div key={n.id} className="rounded-2xl px-3 py-2 text-sm text-ink-soft">
            <span className="text-ink">{n.from}</span> accepted your invitation to connect.
          </div>
        ))}
        {waiting.length === 0 && news.length === 0 && <p className="py-4 text-center text-sm text-ink-faint">Nothing new.</p>}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={btnGhost} onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  )
}

/** The connection dialogs: invite, review a request, what you share, and the notifications list. */
export function ConnectHost() {
  return (
    <>
      <InviteDialog />
      <AcceptDialog />
      <SharesDialog />
      <NoticesDialog />
    </>
  )
}
