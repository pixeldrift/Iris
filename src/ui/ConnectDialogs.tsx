import { useEffect, useRef, useState } from 'react'
import { formatClock, formatDate } from '../core/locale'
import { toISO } from '../core/dates'
import { create } from 'zustand'
import { DEFAULT_SHARES, detailsOf, matchesFor, SHARE_FIELDS } from '../core/linking'
import type { Person } from '../core/types'
import { acceptRequest, declineRequest, deleteNotices, disconnectFrom, markNoticesRead, sendInvite, setMyShares, useConnect, type Connection } from '../sync/connect'
import { useStore } from '../state/store'
import { askConfirm, Modal } from './dialogs'
import { NotificationsRow } from './SettingsDialog'
import { acceptInvite, clearShareNews, declineInvite, leaveGroup, markShareRead, useShare } from '../sync/share'
import { IconBell, IconClose, IconLink } from './icons'
import { closeNotices, dismissAlert, dismissAllAlerts, useAlerts, useNoticesOpen } from './notices'

interface Open {
  invite: Person | null
  accept: Connection | null
  shares: Person | null
}
const useOpen = create<Open>(() => ({ invite: null, accept: null, shares: null }))
export const openInvite = (person: Person) => useOpen.setState({ invite: person })
export const openShares = (person: Person) => useOpen.setState({ shares: person })

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
  const people = useStore((s) => s.people)
  // which of your entries their details fill in: a new one, or one you already have (their own verified email is the only thing preselected)
  const found = c ? matchesFor(people, { name: c.name, email: c.email }) : { sure: [], maybe: [] }
  const choices = [...found.sure, ...found.maybe].slice(0, 4)
  const [into, setInto] = useState<string>('')
  useEffect(() => {
    if (c) {
      setShares(DEFAULT_SHARES)
      setInto(found.sure.length === 1 ? found.sure[0].id : '')
    }
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
          <button type="button" disabled={busy} className={btnMain} onClick={() => c && run(() => acceptRequest(c, shares, into || null), `Connected with ${c.name}`)}>
            Accept
          </button>
        </div>
      }
    >
      <h3 className="font-display text-xl">{c?.name} wants to connect</h3>
      <p className="mt-1.5 text-sm text-ink-soft">
        {c?.email && <span className="text-ink">{c.email}</span>} If you accept, the details they share appear in your address book and stay up to date.
      </p>
      {/* their details fill in one entry of yours: never one picked for you on a guess about the name */}
      <p className="mb-1 mt-3 text-xs font-medium text-ink-soft">Where should they go in your address book?</p>
      <div role="radiogroup" aria-label="Address book entry" className="mb-1 space-y-0.5">
        {[{ id: '', label: 'A new entry' }, ...choices.map((p) => ({ id: p.id, label: `My entry “${p.name}”${found.sure.includes(p) ? ' (same email)' : ''}` }))].map((o) => (
          <label key={o.id || 'new'} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1 text-sm transition hover:bg-white/60">
            <input type="radio" name="into" checked={into === o.id} onChange={() => setInto(o.id)} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
          </label>
        ))}
      </div>
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

const when = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** "3 h ago": tap it for the actual date and time, tap again to go back. */
function When({ iso }: { iso: string }) {
  const [exact, setExact] = useState(false)
  const d = new Date(iso)
  const full = `${formatDate(toISO(d), { weekday: true })} at ${formatClock(d.getHours(), d.getMinutes())}`
  return (
    <button type="button" onClick={() => setExact((e) => !e)} title={exact ? 'Show how long ago' : full} className="rounded text-left text-xs text-ink-faint transition hover:text-ink-soft hover:underline">
      {exact ? full : when(iso)}
    </button>
  )
}

/**
 * Everything waiting for you, in one list: reminders that have gone off (each can be opened, snoozed, finished or dismissed),
 * then connection requests to answer, then the news (people who accepted). Reminders and news can be cleared one by one or all at once.
 */
export function NoticesHost() {
  const open = useNoticesOpen((s) => s.open)
  const { notices, connections } = useConnect()
  const alerts = useAlerts((s) => s.items)
  const tasks = useStore((s) => s.tasks)
  const select = useStore((s) => s.select)
  const setReminder = useStore((s) => s.setReminder)
  const toggleDone = useStore((s) => s.toggleDone)
  const showToast = useStore((s) => s.showToast)
  const close = closeNotices
  useEffect(() => {
    // looking at the news reads the ones that are only news; requests stay until you answer them
    if (!open) return
    const ids = notices.filter((n) => !n.read && n.kind === 'accepted').map((n) => n.id)
    if (ids.length) void markNoticesRead(ids).catch(() => undefined)
    if (useShare.getState().news.some((n) => !n.read)) void markShareRead().catch(() => undefined)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const reminders = alerts.flatMap((a) => {
    const t = tasks.find((x) => x.id === a.id)
    return t ? [{ t, note: a.note }] : []
  })
  const waiting = connections.filter((c) => c.status === 'pending-in')
  const { invites, news: shareNews, shares } = useShare()
  const shareLines = shareNews.filter((n) => !n.read || Date.now() - new Date(n.at).getTime() < 3 * 86_400_000)
  const news = notices.filter((n) => n.kind === 'accepted')
  const clearable = reminders.length + news.length + shareLines.filter((n) => n.kind !== 'share-invite').length
  const remove = (ids?: string[]) => deleteNotices(ids).catch((e) => showToast((e as Error).message))
  const pill = 'rounded-full bg-white/70 px-3 py-1 text-xs text-ink-soft transition hover:bg-white'
  return (
    <Modal open={open} onClose={close} label="Notifications">
      <div className="flex items-center">
        <h3 className="font-display text-xl">Notifications</h3>
        {clearable > 0 && (
          <button
            type="button"
            onClick={() => {
              dismissAllAlerts()
              if (news.length) void remove()
              if (shareLines.some((n) => n.kind !== 'share-invite')) void clearShareNews().catch((e) => showToast((e as Error).message))
            }}
            className="ml-auto whitespace-nowrap rounded-full px-3 py-1 text-xs text-lilac-600 transition hover:bg-white/70 hover:text-lilac-700"
          >
            Clear all
          </button>
        )}
        <button type="button" onClick={close} aria-label="Close notifications" title="Close" className={`${clearable > 0 ? '' : 'ml-auto '}-mr-1.5 grid h-8 w-8 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-ink`}>
          <IconClose size={16} />
        </button>
      </div>
      <ul className="mt-3 space-y-1.5" aria-label="Notifications">
        {reminders.map(({ t, note }) => (
          <li key={t.id} className="rounded-2xl bg-white/55 py-2.5 pl-3 pr-2">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lilac-100 text-lilac-600">
                <IconBell size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.title || 'Untitled'}</div>
                <div className="text-xs text-ink-soft">{note}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button type="button" className="rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30" onClick={() => (select(t.id), dismissAlert(t.id), close())}>
                    Open
                  </button>
                  <button type="button" className={pill} onClick={() => (setReminder(t.id, Date.now() + 10 * 60_000), dismissAlert(t.id))}>
                    Snooze 10 min
                  </button>
                  <button type="button" className={pill} onClick={() => (toggleDone(t.id), dismissAlert(t.id))}>
                    {t.kind === 'habit' ? 'Done today' : 'Done'}
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => dismissAlert(t.id)} aria-label={`Dismiss ${t.title || 'reminder'}`} title="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/80 hover:text-[#b04a6e]">
                <IconClose size={12} />
              </button>
            </div>
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{i.from} invited you to share “{i.name}”</div>
              <div className="text-xs text-ink-faint">{i.role === 'viewer' ? 'You’d be able to view it' : 'You’d be able to view and change it'}</div>
            </div>
            <button type="button" className="rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30" onClick={() => void acceptInvite(i.id).then((r) => showToast(`You joined “${r.name}”.`), (e) => showToast((e as Error).message))}>
              Join
            </button>
            <button type="button" className={pill} onClick={() => void declineInvite(i.id).catch((e) => showToast((e as Error).message))}>
              Decline
            </button>
          </li>
        ))}
        {shareLines
          .filter((n) => n.kind !== 'share-invite')
          .map((n) => {
            const leaving = n.kind === 'share-removed' ? shares.find((x) => x.workspaceId === n.workspaceId && x.status === 'leaving') : undefined
            const text =
              n.kind === 'share-removed' ? `${n.from} stopped sharing “${n.info}” with you${n.extra === 'copy' ? '. You can keep a copy.' : '.'}`
              : n.kind === 'share-joined' ? `${n.from} joined “${n.info}”`
              : n.kind === 'share-left' ? `${n.from} left “${n.info}”`
              : n.kind === 'assigned' ? `${n.from} gave you “${n.info}”`
              : n.info
            return (
              <li key={n.id} className="flex items-center gap-2 rounded-2xl bg-white/35 py-2 pl-3 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink">{text}</div>
                  <When iso={n.at} />
                </div>
                {n.kind === 'assigned' && (
                  <button type="button" className="rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30" onClick={() => (select(n.extra), close())}>
                    Open
                  </button>
                )}
                {leaving && (
                  <>
                    {leaving.canCopy && (
                      <button type="button" className="rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30" onClick={() => void leaveGroup(leaving, true).then(() => showToast('Kept a copy.'), (e) => showToast((e as Error).message))}>
                        Keep a copy
                      </button>
                    )}
                    <button type="button" className={pill} onClick={() => void leaveGroup(leaving, false).catch((e) => showToast((e as Error).message))}>
                      Let it go
                    </button>
                  </>
                )}
                <button type="button" onClick={() => void clearShareNews(n.id).catch((e) => showToast((e as Error).message))} aria-label="Clear this notification" title="Clear" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/80 hover:text-ink">
                  <IconClose size={12} />
                </button>
              </li>
            )
          })}
        {waiting.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5">
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
          </li>
        ))}
        {news.map((n) => (
          <li key={n.id} className="flex items-center gap-2 rounded-2xl bg-white/35 py-2 pl-3 pr-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink">
                <span className="font-medium">{n.from}</span> accepted your invitation
              </div>
              <When iso={n.at} />
            </div>
            <button type="button" onClick={() => void remove([n.id])} aria-label={`Delete notification from ${n.from}`} title="Delete" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/80 hover:text-[#b04a6e]">
              <IconClose size={12} />
            </button>
          </li>
        ))}
      </ul>
      {reminders.length === 0 && waiting.length === 0 && news.length === 0 && invites.length === 0 && shareLines.length === 0 && <p className="py-5 text-center text-sm text-ink-faint">Nothing new.</p>}
      <div className="mt-4 border-t border-white/50 pt-1">
        <NotificationsRow compact />
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" className={btnGhost} onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  )
}

/** The connection dialogs: invite, review a request, and what you share. */
export function ConnectHost() {
  return (
    <>
      <InviteDialog />
      <AcceptDialog />
      <SharesDialog />
    </>
  )
}
