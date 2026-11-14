import { useRef, useState } from 'react'
import { assigneesOf } from '../core/tasks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { assignToUser, assignTask, leaveGroup, removeMember, setMemberRole, shareTask, stopSharing, useShare, type ShareInfo, type ShareMember } from '../sync/share'
import { Box } from './Box'
import { IconClose, IconPerson, IconPlus } from './icons'
import { MenuItem, Popover } from './Popover'
import { TagInput } from './TagInput'

type Person = ReturnType<typeof useStore.getState>['people'][number]
type Panel = 'assign' | 'invite' | 'share'
type Role = 'editor' | 'viewer'

const pill = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/70 px-2.5 py-1 text-sm font-normal text-lilac-700 shadow-sm transition hover:bg-white disabled:opacity-50'
const hint = 'text-[0.68rem] text-ink-faint'
const label = 'block text-xs font-medium text-ink-soft'

/** Everything the "Who" box needs to know about a task: how it is shared, who is on it, and what the person looking at it may do. */
function useWho(task: Task) {
  const share = useShare((s) => s.shares.find((x) => x.workspaceId === task.workspaceId))
  const me = useShare((s) => s.me)
  const loaded = useShare((s) => s.loaded)
  const people = useStore((s) => s.people)
  const members = share?.members.filter((m) => m.status === 'active') ?? []
  const others = members.filter((m) => m.userId !== me)
  const assigned = assigneesOf(task)
  const given = assigned.filter((id) => !share || members.some((m) => m.userId === id))
  const isIndividualShare = !!share && share.rootTaskId === task.id
  const isGroupShare = !!task.workspaceId && !!share && !isIndividualShare
  const nameOf = (id: string) => (id === me ? 'Me' : (members.find((m) => m.userId === id)?.name ?? people.find((p) => p.id === id || p.link?.userId === id)?.name ?? 'Former contact'))
  // connected people who are not yet in this item's workspace (to invite or share with)
  const connected = loaded ? people.filter((p) => p.link?.userId && p.link.userId !== me && !members.some((m) => m.userId === p.link!.userId)) : []
  // on a private item an assignment can name any address-book contact (a linked one is promoted into a shared workspace; an unlinked one stays local)
  const taken = new Set(assigned)
  const assignablePeople = !task.workspaceId && loaded ? people.filter((p) => !p.isMe && !taken.has(p.id) && (!p.link?.userId || (p.link.userId !== me && !taken.has(p.link.userId)))) : []
  return {
    share, me, loaded, people, members, others, given, nameOf, connected, assignablePeople, isIndividualShare, isGroupShare,
    notMember: members.filter((m) => !given.includes(m.userId)),
    canEdit: !task.workspaceId || (!!share && share.role !== 'viewer'),
    canManageIndividual: !task.workspaceId || (isIndividualShare && share?.role === 'owner'),
    summary: given.length === 0 ? 'Unassigned' : given.length === 1 ? nameOf(given[0]) : given.length === 2 ? `${nameOf(given[0])} and ${nameOf(given[1])}` : `${nameOf(given[0])} and ${given.length - 1} others`,
  }
}
type Who = ReturnType<typeof useWho>

/** Runs a sharing action: busy while it works, a message when it is done or could not be. */
function useRun() {
  const showToast = useStore((s) => s.showToast)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, success: string, after?: () => void) => {
    setBusy(true)
    after?.()
    try {
      await fn()
      showToast(success)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update who is connected to this item.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

/** The little "+ Assign" style button that opens a menu under itself. */
function AddPill({ text, open, onToggle, disabled, anchor }: { text: string; open: boolean; onToggle: () => void; disabled?: boolean; anchor: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <button ref={anchor} type="button" disabled={disabled} onClick={onToggle} aria-expanded={open} className={pill}>
      <IconPlus size={12} /> {text}
    </button>
  )
}

/** A removable name: an "x" that takes the person off. */
function Chip({ text, onRemove, removeLabel, tone = 'bg-lilac-100 text-lilac-700' }: { text: React.ReactNode; onRemove?: () => void; removeLabel: string; tone?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 text-sm font-normal ${onRemove ? 'pr-1' : 'pr-2.5'} ${tone}`}>
      {text}
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className="grid h-5 w-5 place-items-center rounded-full text-lilac-600 transition hover:bg-white/80">
          <IconClose size={10} />
        </button>
      )}
    </span>
  )
}

function Tagged({ task, who }: { task: Task; who: Who }) {
  return (
    <div>
      <span className={label}>Tagged</span>
      <div className="mt-1.5">
        {who.canEdit ? (
          <TagInput taskId={task.id} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {task.personIds.map((id) => {
              const person = who.people.find((p) => p.id === id)
              return person ? (
                <span key={id} className="rounded-full bg-white/70 px-2.5 py-1 text-xs text-ink-soft">
                  @{person.name.split(' ')[0]}
                </span>
              ) : null
            })}
          </div>
        )}
      </div>
      <p className={`mt-1 ${hint}`}>Tags organize and filter this item; they never invite or assign anyone.</p>
    </div>
  )
}

function Assigned({ task, who, run, busy, panel, setPanel }: { task: Task; who: Who; run: ReturnType<typeof useRun>['run']; busy: boolean; panel: Panel | null; setPanel: (p: Panel | null) => void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const assignPerson = (person: Person) => run(() => assignToUser(task, person.link?.userId ?? person.id, person.link?.userId ? 'link' : 'local'), `Assigned to ${person.name}.`, () => setPanel(null))
  return (
    <div className="mt-3">
      <span className={label}>Assigned to</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Assigned to">
        {who.given.length === 0 && <span className="text-sm font-normal text-ink-faint">Nobody yet</span>}
        {who.given.map((id) => (
          <Chip key={id} text={who.nameOf(id)} removeLabel={`Remove ${who.nameOf(id)}`} onRemove={who.canEdit ? () => assignTask(task, who.given.filter((x) => x !== id)) : undefined} />
        ))}
        {who.canEdit && (!task.workspaceId || who.notMember.length > 0) && <AddPill text="Assign" anchor={anchor} open={panel === 'assign'} disabled={busy || (!!task.workspaceId && !who.share)} onToggle={() => setPanel(panel === 'assign' ? null : 'assign')} />}
      </div>
      <Popover open={panel === 'assign'} onClose={() => setPanel(null)} anchor={anchor} className="w-56 p-1.5">
        <div aria-label="Assign someone">
          {who.share
            ? who.notMember.map((m) => (
                <MenuItem key={m.userId} onClick={() => (assignTask(task, [...who.given, m.userId]), setPanel(null))}>
                  {m.userId === who.me ? 'Me' : m.name}
                </MenuItem>
              ))
            : who.assignablePeople.map((p) => (
                <MenuItem key={p.id} onClick={() => void assignPerson(p)}>
                  {p.name}
                </MenuItem>
              ))}
          {!who.share && !who.loaded && <p className={`px-2.5 py-2 ${hint}`}>Loading people…</p>}
          {!who.share && who.loaded && who.assignablePeople.length === 0 && <p className={`px-2.5 py-2 leading-relaxed ${hint}`}>No one left to assign. Add a person in Tagged or People first.</p>}
        </div>
      </Popover>
    </div>
  )
}

function Invited({ task, who, run, busy, panel, setPanel }: { task: Task; who: Who; run: ReturnType<typeof useRun>['run']; busy: boolean; panel: Panel | null; setPanel: (p: Panel | null) => void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const guests = who.others.filter((m) => m.role === 'viewer')
  const share = who.share
  return (
    <div className="mt-3">
      <span className={label}>Invited</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Invited guests">
        {guests.length === 0 && <span className="text-sm font-normal text-ink-faint">Nobody yet</span>}
        {guests.map((m) => (
          <Chip
            key={m.userId}
            tone="bg-sky-100/70 text-ink-soft"
            text={
              <>
                {m.name}
                <span className="text-[0.65rem] text-ink-faint">Guest</span>
              </>
            }
            removeLabel={`Remove ${m.name} from this event`}
            onRemove={share?.role === 'owner' ? () => void run(() => removeMember(share.workspaceId, m.userId, false), `Removed ${m.name} from the event.`) : undefined}
          />
        ))}
        {who.canManageIndividual && !who.isGroupShare && <AddPill text="Invite" anchor={anchor} open={panel === 'invite'} disabled={busy} onToggle={() => setPanel(panel === 'invite' ? null : 'invite')} />}
      </div>
      <Popover open={panel === 'invite'} onClose={() => setPanel(null)} anchor={anchor} className="w-56 p-1.5">
        <div aria-label="Invite someone to this event">
          {who.connected.map((p) => (
            <MenuItem key={p.id} onClick={() => void run(() => shareTask(task, p.link!.userId, 'viewer', 'event'), `Invitation sent to ${p.name}.`, () => setPanel(null))}>
              {p.name}
            </MenuItem>
          ))}
          {!who.loaded && <p className={`px-2.5 py-2 ${hint}`}>Loading connected people…</p>}
          {who.loaded && who.connected.length === 0 && <p className={`px-2.5 py-2 ${hint}`}>No connected people available to invite.</p>}
        </div>
      </Popover>
      {who.isGroupShare && <p className={`mt-1 ${hint}`}>This event is inside a shared group. Invite guests individually after moving it out of that group.</p>}
      {who.isIndividualShare && share?.pending ? (
        <p className={`mt-1 ${hint}`}>
          {share.pending} invitation{share.pending === 1 ? '' : 's'} awaiting a response.
        </p>
      ) : null}
    </div>
  )
}

function SharedWith({ task, who, run, busy, panel, setPanel }: { task: Task; who: Who; run: ReturnType<typeof useRun>['run']; busy: boolean; panel: Panel | null; setPanel: (p: Panel | null) => void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [role, setRole] = useState<Role>('editor')
  const share = who.share
  if (who.isGroupShare) {
    return (
      <div className="mt-3">
        <span className={label}>Shared with</span>
        <p className="mt-1 text-sm font-normal text-ink-faint">Shared through “{share?.name}”. Access is managed from that group.</p>
      </div>
    )
  }
  const owner = share?.role === 'owner'
  const sharedWith = who.others.filter((m) => task.kind !== 'event' || m.role !== 'viewer')
  return (
    <div className="mt-3">
      <span className={label}>Shared with</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="People with access">
        {sharedWith.map((m) => (
          <Member key={m.userId} member={m} share={share} owner={owner} busy={busy} run={run} />
        ))}
        {who.canManageIndividual && <AddPill text="Share" anchor={anchor} open={panel === 'share'} disabled={busy} onToggle={() => setPanel(panel === 'share' ? null : 'share')} />}
      </div>
      <Popover open={panel === 'share'} onClose={() => setPanel(null)} anchor={anchor} className="w-60 p-2">
        <label className="mb-1 block px-1 text-xs text-ink-soft">Give access</label>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="well mb-1.5 w-full rounded-xl px-2.5 py-1.5 text-sm" aria-label="Share permission">
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        {who.connected.map((p) => (
          <MenuItem key={p.id} onClick={() => void run(() => shareTask(task, p.link!.userId, role), `Shared with ${p.name} (${role === 'editor' ? 'can edit' : 'can view'}).`, () => setPanel(null))}>
            {p.name}
          </MenuItem>
        ))}
        {!who.loaded && <p className={`px-2.5 py-2 ${hint}`}>Loading connected people…</p>}
        {who.loaded && who.connected.length === 0 && <p className={`px-2.5 py-2 ${hint}`}>No connected people available to share with.</p>}
      </Popover>
    </div>
  )
}

/** Someone with access: their name, what they may do (changeable by the owner), and a way to remove them. */
function Member({ member, share, owner, busy, run }: { member: ShareMember; share: ShareInfo | undefined; owner: boolean; busy: boolean; run: ReturnType<typeof useRun>['run'] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-sm font-normal text-ink-soft shadow-sm">
      {member.name}
      {owner && share ? (
        <select
          aria-label={`${member.name}: access permission`}
          value={member.role}
          disabled={busy}
          onChange={(e) => void run(() => setMemberRole(share.workspaceId, member.userId, e.target.value as Role), `Updated ${member.name}’s access.`)}
          className="well rounded-full px-2 py-0.5 text-[0.65rem]"
        >
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
      ) : (
        <span className="text-[0.65rem] text-ink-faint">{member.role === 'editor' ? 'Can edit' : 'Can view'}</span>
      )}
      {owner && share && (
        <button type="button" aria-label={`Remove ${member.name} from this item`} onClick={() => void run(() => removeMember(share.workspaceId, member.userId, false), `Removed ${member.name}.`)} className="ml-0.5 rounded-full p-0.5 text-ink-faint hover:bg-white">
          <IconClose size={10} />
        </button>
      )}
    </span>
  )
}

/**
 * Who is on an item: the people tagged on it (they organize and filter, never invite), who it is assigned to, for an event who is invited, and
 * who it is shared with. An item can be shared on its own, without sharing its group.
 */
export function WhoBox({ task }: { task: Task }) {
  const who = useWho(task)
  const { busy, run } = useRun()
  const [panel, setPanel] = useState<Panel | null>(null)
  const share = who.share
  const common = { task, who, run, busy, panel, setPanel }
  return (
    <Box title="Who" icon={<IconPerson size={13} />} summary={who.summary}>
      {task.workspaceId && (!who.loaded || !share || share.role === 'viewer') && (
        <p className={hint}>{!who.loaded ? 'Loading sharing permissions…' : share?.role === 'viewer' ? 'View-only access: only the owner and editors can add people or change these settings.' : 'Sharing details are unavailable, so people settings are read-only.'}</p>
      )}
      <Tagged task={task} who={who} />
      <Assigned {...common} />
      {task.kind === 'event' && <Invited {...common} />}
      <SharedWith {...common} />
      {share && who.isIndividualShare && (
        <button type="button" onClick={() => void run(() => (share.role === 'owner' ? stopSharing(share, false) : leaveGroup(share, false)), share.role === 'owner' ? 'Stopped sharing this item.' : 'Left the shared item.')} className="mt-2 text-xs text-ink-faint transition hover:text-ink">
          {share.role === 'owner' ? 'Stop sharing this item' : 'Leave shared item'}
        </button>
      )}
    </Box>
  )
}
