import { useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { useConnect } from '../sync/connect'
import { countShared, memberPhoto, inviteConnection, inviteLink, leaveGroup, removeMember, setMemberRole, shareGroup, stopSharing, useShare, type ShareInfo } from '../sync/share'
import { Modal } from './dialogs'
import { IconLink, IconPerson } from './icons'

const useOpen = create<{ folderId: string | null }>(() => ({ folderId: null }))
export const openShareDialog = (folderId: string) => useOpen.setState({ folderId })
const close = () => useOpen.setState({ folderId: null })

const btnGhost = 'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-ink-soft transition hover:bg-white/70'
const btnMain = 'whitespace-nowrap rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 disabled:opacity-40'
const btnWarn = 'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-[#9a4566] transition hover:bg-rose-soft/40'

const roleName = (r: string) => (r === 'owner' ? 'Owner' : r === 'viewer' ? 'Can view' : 'Can edit')

/** Share a group with people: who is in it, what they can do, and what happens to their copy when it stops. */
export function ShareDialog() {
  const folderId = useOpen((s) => s.folderId)
  const folder = useStore((s) => s.folders.find((f) => f.id === folderId))
  const shares = useShare((s) => s.shares)
  const showToast = useStore((s) => s.showToast)
  const connections = useConnect((s) => s.connections)
  const myId = useShare((s) => s.me)
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<null | { kind: 'remove'; userId: string; name: string } | { kind: 'stop' } | { kind: 'leave' }>(null)
  const [link, setLink] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')

  // the share this group is the root of; or the shared group it sits inside
  // (a share whose group has since been taken back home is an empty shell, not this group's sharing)
  const own = shares.find((s) => s.rootFolderId === folderId && folder?.workspaceId === s.workspaceId)
  const inside = folder?.workspaceId ? shares.find((s) => s.workspaceId === folder.workspaceId) : undefined
  const share: ShareInfo | undefined = own ?? inside
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await fn()
      if (done) showToast(done)
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setBusy(false)
      setAsk(null)
    }
  }
  const mine = share?.role === 'owner'
  const taken = new Set(share?.members.map((m) => m.userId) ?? [])
  const people = connections.filter((c) => c.status === 'accepted' && c.userId && !taken.has(c.userId))

  return (
    <Modal open={!!folder} onClose={close} label="Share a group">
      {folder && (
        <div className="space-y-3">
          <h3 className="font-display text-xl">{share ? share.name : `Share “${folder.name}”`}</h3>
          {!share && (
            <>
              <p className="text-sm text-ink-soft">
                Share this group with people you’re connected with, like a shared note: you can all see and change its tasks, and give tasks to each other.
                {countShared(folder.id) > 0 && ` The ${countShared(folder.id)} task${countShared(folder.id) === 1 ? '' : 's'} in it (and the groups under it) will be shared; everything else stays private.`}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className={btnGhost} onClick={close}>
                  Not now
                </button>
                <button type="button" disabled={busy} className={btnMain} onClick={() => void run(() => shareGroup(folder), 'Shared. Invite someone below.')}>
                  Share this group
                </button>
              </div>
            </>
          )}
          {share && (
            <>
              {share.status === 'leaving' && <p className="rounded-xl bg-white/50 px-3 py-2 text-sm text-ink-soft">This group is no longer being shared with you. You can still read it until you decide below.</p>}
              <ul className="space-y-1" aria-label="Members">
                {share.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 rounded-xl bg-white/45 px-3 py-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-lilac-100 text-xs font-medium text-lilac-700">{memberPhoto(m.userId, myId) ? <img src={memberPhoto(m.userId, myId)} alt="" draggable={false} className="h-full w-full object-cover" /> : m.name.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                    {mine && m.role !== 'owner' && m.status === 'active' ? (
                      <>
                        <select aria-label={`${m.name}: what they can do`} value={m.role} disabled={busy} onChange={(e) => void run(() => setMemberRole(share.workspaceId, m.userId, e.target.value as 'editor' | 'viewer'))} className="well rounded-full px-2 py-1 text-xs">
                          <option value="editor">Can edit</option>
                          <option value="viewer">Can view</option>
                        </select>
                        <button type="button" className={btnWarn} onClick={() => setAsk({ kind: 'remove', userId: m.userId, name: m.name })}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-ink-faint">{m.status === 'leaving' ? 'Leaving' : roleName(m.role)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {mine && (
                <div className="space-y-2 rounded-2xl bg-white/35 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                    <span>Invite as</span>
                    <select aria-label="Invite as" value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} className="well rounded-full px-2 py-1 text-xs font-normal">
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    {share.pending > 0 && <span className="ml-auto font-normal text-ink-faint">{share.pending} waiting</span>}
                  </div>
                  {people.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <IconPerson size={14} />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                      <button type="button" disabled={busy} className={btnMain} onClick={() => void run(() => inviteConnection(share.workspaceId, c.userId!, role), `Invited ${c.name}.`)}>
                        Invite
                      </button>
                    </div>
                  ))}
                  {people.length === 0 && <p className="text-xs text-ink-faint">Connect with people from the address book to invite them by name, or send a link.</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      className={`${btnGhost} flex items-center gap-1.5`}
                      onClick={() =>
                        void run(async () => {
                          const url = await inviteLink(share.workspaceId, role)
                          setLink(url)
                          await navigator.clipboard?.writeText(url).catch(() => undefined)
                        }, 'Link copied. It works once, for 14 days.')
                      }
                    >
                      <IconLink size={14} /> Copy an invite link
                    </button>
                  </div>
                  {link && <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="well w-full rounded-xl px-2.5 py-1.5 text-xs" />}
                </div>
              )}
              {ask?.kind === 'remove' && (
                <ChoiceCard
                  title={`Remove ${ask.name}?`}
                  text="You choose whether they may keep a copy of the group. If they may, they’re told and decide for themselves; if not, it disappears for them now."
                  busy={busy}
                  onCopy={() => void run(() => removeMember(share.workspaceId, ask.userId, true), `${ask.name} was removed and may keep a copy.`)}
                  onNone={() => void run(() => removeMember(share.workspaceId, ask.userId, false), `${ask.name} was removed.`)}
                  onCancel={() => setAsk(null)}
                  copyLabel="Remove, they may keep a copy"
                  noneLabel="Remove, no copy"
                />
              )}
              {ask?.kind === 'stop' && (
                <ChoiceCard
                  title="Stop sharing this group?"
                  text="It stays yours. You choose whether the others may keep a copy: if so they’re told and decide for themselves, and it comes back to you once they have; if not, it disappears for them now."
                  busy={busy}
                  onCopy={() => void run(() => stopSharing(share, true), 'No longer shared. People who may keep a copy have been told.')}
                  onNone={() => void run(() => stopSharing(share, false), 'No longer shared.')}
                  onCancel={() => setAsk(null)}
                  copyLabel="Stop, they may keep a copy"
                  noneLabel="Stop, no copy"
                />
              )}
              {ask?.kind === 'leave' && (
                <ChoiceCard
                  title="Leave this group?"
                  text="It disappears from your list. You can keep a copy of what’s in it now, which is yours alone and stops syncing."
                  busy={busy}
                  onCopy={() => void run(async () => { await leaveGroup(share, true); close() }, 'You left, and kept a copy.')}
                  onNone={() => void run(async () => { await leaveGroup(share, false); close() }, 'You left.')}
                  onCancel={() => setAsk(null)}
                  copyLabel="Leave and keep a copy"
                  noneLabel="Leave, no copy"
                />
              )}
              <div className="flex items-center gap-2">
                {mine && !ask && (
                  <button type="button" className={btnWarn} onClick={() => setAsk({ kind: 'stop' })}>
                    Stop sharing
                  </button>
                )}
                {!mine && !ask && share.status === 'active' && (
                  <button type="button" className={btnWarn} onClick={() => setAsk({ kind: 'leave' })}>
                    Leave
                  </button>
                )}
                {!mine && !ask && share.status === 'leaving' && (
                  <>
                    {share.canCopy && (
                      <button type="button" disabled={busy} className={btnMain} onClick={() => void run(async () => { await leaveGroup(share, true); close() }, 'Kept a copy.')}>
                        Keep a copy
                      </button>
                    )}
                    <button type="button" disabled={busy} className={btnWarn} onClick={() => void run(async () => { await leaveGroup(share, false); close() })}>
                      Let it go
                    </button>
                  </>
                )}
                <button type="button" className={`${btnGhost} ml-auto`} onClick={close}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function ChoiceCard({ title, text, busy, onCopy, onNone, onCancel, copyLabel, noneLabel }: { title: string; text: string; busy: boolean; onCopy: () => void; onNone: () => void; onCancel: () => void; copyLabel: string; noneLabel: string }) {
  return (
    <div role="group" aria-label={title} className="space-y-2 rounded-2xl border border-[#c4577e]/30 bg-white/50 p-3">
      <div className="text-sm font-medium">{title}</div>
      <p className="text-xs text-ink-soft">{text}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btnMain} onClick={onCopy}>
          {copyLabel}
        </button>
        <button type="button" disabled={busy} className={btnWarn} onClick={onNone}>
          {noneLabel}
        </button>
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
