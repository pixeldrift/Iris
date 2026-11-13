import { assigneesOf, effectiveUrgency } from '../core/tasks'
import type { Task } from '../core/types'
import { SegmentedToggle } from './SegmentedToggle'
import { ListEditor } from './ListEditor'
import { ReminderField } from './ReminderField'
import { RecentStrip, RepeatField, ScheduleFields } from './KindFields'
import { useEffect, useRef, useState } from 'react'
import { allLinks } from '../core/people'
import { useStore } from '../state/store'
import { useExit } from './anim'
import { notionImageFrom } from './photo'
import { ImageViewer } from './ImageViewer'
import { describeRecurrence } from '../core/recurrence'
import { assignTask, shareTask, stopSharing, leaveGroup, setMemberRole, removeMember, useShare } from '../sync/share'
import { askConfirm } from './dialogs'
import { NumberField } from './NumberPad'
import * as sound from '../audio/engine'
import { progressOf } from '../core/progress'
import { IconCalendar, IconChart, IconImage, IconCheck, IconChevron, IconClose, IconPencil, IconPerson, IconPin, IconPlus, IconPriority, IconRepeat, IconNote, IconTrash } from './icons'
import { MenuItem, Popover } from './Popover'
import { DoneButton, KindHint, KINDS, OpenPlace, STATUSES } from './shared'
import { TagInput } from './TagInput'
import { Tip } from './Tip'

function SoftSlider({ label, shown = label, compact = false, left, right, value, onChange, actual, actualNote }: { label: string; shown?: string; compact?: boolean; left: string; right: string; value: number; onChange: (v: number) => void; actual?: number; actualNote?: string }) {
  return (
    <label className="block" title={`${label}: ${left} … ${right}`}>
      <span className="mb-0.5 block truncate text-xs font-medium text-ink-soft">{shown}</span>
      <span className="relative block">
        <input type="range" min={0} max={1} step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className="soft" aria-label={label} />
        {/* a small dot under the slider where the value really in use sits, when it is not where the slider has been left */}
        {actual !== undefined && Math.abs(actual - value) > 0.02 && (
          <span
            role="img"
            aria-label={`In use: ${Math.round(actual * 100)} percent. ${actualNote ?? ''}`}
            title={`In use: ${Math.round(actual * 100)}%${actualNote ? ` (${actualNote})` : ''}`}
            data-actual
            className="absolute bottom-[-0.15rem] z-20 grid h-3.5 w-3.5 -translate-x-1/2 place-items-center"
            style={{ left: `calc(0.55rem + (100% - 1.1rem) * ${Math.min(1, Math.max(0, actual))})` }}
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-lilac-700" />
          </span>
        )}
      </span>
      {!compact && (
        <span className="-mt-1.5 flex justify-between text-[0.68rem] leading-none text-ink-faint">
          <span>{left}</span>
          <span>{right}</span>
        </span>
      )}
    </label>
  )
}

/** Where it is: a place, a room, a link (events keep theirs beside their times). */
function PlaceField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  return (
    <span className="flex items-center gap-1.5">
      <input value={task.place} aria-label="Where" onChange={(e) => update(task.id, { place: e.target.value })} placeholder="A place, a room, a link…" className="well min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-normal text-ink placeholder:text-ink-faint" />
      <OpenPlace place={task.place} />
    </span>
  )
}

/**
 * The dates of a task, in two plain steps: the day you plan to do it, and its deadline. Each has a reminder of its own right
 * under it. The timeline start and what happens if the day passes live under "More", out of the way.
 */
/** In a shared group: who the task is given to (a member or several), and they are told. */
function AssignField({ task }: { task: Task }) {
  const share = useShare((s) => s.shares.find((x) => x.workspaceId === task.workspaceId))
  const me = useShare((s) => s.me)
  const shareLoaded = useShare((s) => s.loaded)
  const people = useStore((s) => s.people)
  const showToast = useStore((s) => s.showToast)
  const [open, setOpen] = useState<null | 'assign' | 'invite' | 'share'>(null)
  const [busy, setBusy] = useState(false)
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor')
  const assignAnchor = useRef<HTMLButtonElement>(null)
  const inviteAnchor = useRef<HTMLButtonElement>(null)
  const shareAnchor = useRef<HTMLButtonElement>(null)
  const members = share?.members.filter((m) => m.status === 'active') ?? []
  const others = members.filter((m) => m.userId !== me)
  const assigned = assigneesOf(task)
  const given = assigned.filter((id) => !share || members.some((m) => m.userId === id))
  const left = members.filter((m) => !given.includes(m.userId))
  const connected = shareLoaded
    ? people.filter((p) => p.link?.userId && p.link.userId !== me && !members.some((m) => m.userId === p.link!.userId))
    : []
  const isIndividualShare = !!share && share.rootTaskId === task.id
  const isGroupShare = !!task.workspaceId && !!share && !isIndividualShare
  const canEdit = !task.workspaceId || (!!share && share.role !== 'viewer')
  const canManageIndividual = !task.workspaceId || (isIndividualShare && share?.role === 'owner')
  const nameOf = (id: string) =>
    id === me ? 'Me' : (members.find((m) => m.userId === id)?.name ?? people.find((p) => p.link?.userId === id)?.name ?? 'Someone')
  const whoSummary = given.length > 2
    ? `${nameOf(given[0])} and ${given.length - 1} others`
    : given.length === 2 ? `${nameOf(given[0])} and ${nameOf(given[1])}`
      : given.length === 1 ? nameOf(given[0]) : 'Unassigned'

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true)
    setOpen(null)
    try {
      await fn()
      showToast(success)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update who is connected to this item.')
    } finally {
      setBusy(false)
    }
  }
  const assignConnected = (userId: string) => run(async () => {
    await shareTask(task, userId, 'editor')
    const latest = useStore.getState().tasks.find((t) => t.id === task.id)
    if (latest) assignTask(latest, [...new Set([...assigneesOf(latest), userId])])
  }, `Assigned to ${nameOf(userId)}.`)
  const inviteGuest = (userId: string) => run(
    () => shareTask(task, userId, 'viewer', 'event'),
    `Invitation sent to ${nameOf(userId)}.`,
  )
  const shareWith = (userId: string) => run(
    () => shareTask(task, userId, shareRole),
    `Shared with ${nameOf(userId)} (${shareRole === 'editor' ? 'can edit' : 'can view'}).`,
  )
  const assignedNames = given.map(nameOf)

  return (
    <Box title="Who" icon={<IconPerson size={13} />} summary={whoSummary}>
      <div>
        <span className="block text-xs font-medium text-ink-soft">Tagged</span>
        <div className="mt-1.5">
          {canEdit ? <TagInput taskId={task.id} /> : (
            <div className="flex flex-wrap gap-1.5">
              {task.personIds.map((id) => {
                const person = people.find((p) => p.id === id)
                return person ? <span key={id} className="rounded-full bg-white/70 px-2.5 py-1 text-xs text-ink-soft">@{person.name.split(' ')[0]}</span> : null
              })}
            </div>
          )}
        </div>
        <p className="mt-1 text-[0.68rem] text-ink-faint">Tags organize and filter this item; they never invite or assign anyone.</p>
      </div>

      <div className="mt-3">
        <span className="block text-xs font-medium text-ink-soft">Assigned to</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Assigned to">
          {assignedNames.length === 0 && <span className="text-sm font-normal text-ink-faint">Nobody yet</span>}
          {given.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-lilac-100 py-0.5 pl-2.5 pr-1 text-sm font-normal text-lilac-700">
              {nameOf(id)}
              {canEdit && (
                <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => assignTask(task, given.filter((x) => x !== id))} className="grid h-5 w-5 place-items-center rounded-full text-lilac-600 transition hover:bg-white/80">
                  <IconClose size={10} />
                </button>
              )}
            </span>
          ))}
          {canEdit && (!task.workspaceId || left.length > 0) && (
            <button ref={assignAnchor} type="button" disabled={busy || (task.workspaceId && !share)} onClick={() => setOpen((o) => o === 'assign' ? null : 'assign')} aria-expanded={open === 'assign'} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/70 px-2.5 py-1 text-sm font-normal text-lilac-700 shadow-sm transition hover:bg-white disabled:opacity-50">
              <IconPlus size={12} /> Assign
            </button>
          )}
        </div>
        <Popover open={open === 'assign'} onClose={() => setOpen(null)} anchor={assignAnchor} className="w-56 p-1.5">
          <div aria-label="Assign someone">
            {share ? left.map((m) => (
              <MenuItem key={m.userId} onClick={() => (assignTask(task, [...given, m.userId]), setOpen(null))}>{m.userId === me ? 'Me' : m.name}</MenuItem>
            )) : connected.map((p) => (
              <MenuItem key={p.id} onClick={() => void assignConnected(p.link!.userId)}>{p.name}</MenuItem>
            ))}
            {!share && !shareLoaded && <p className="px-2.5 py-2 text-xs text-ink-faint">Loading connected people…</p>}
            {!share && shareLoaded && connected.length === 0 && <p className="px-2.5 py-2 text-xs leading-relaxed text-ink-faint">Connect with someone from People before assigning this item.</p>}
          </div>
        </Popover>
      </div>

      {task.kind === 'event' && (
        <div className="mt-3">
          <span className="block text-xs font-medium text-ink-soft">Invited</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Invited guests">
            {others.filter((m) => m.role === 'viewer').length === 0 && <span className="text-sm font-normal text-ink-faint">Nobody yet</span>}
            {others.filter((m) => m.role === 'viewer').map((m) => (
              <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-sky-100/70 px-2.5 py-1 text-sm font-normal text-ink-soft">
                {m.name}<span className="text-[0.65rem] text-ink-faint">Guest</span>
                {share?.role === 'owner' && (
                  <button type="button" aria-label={`Remove ${m.name} from this event`} onClick={() => void run(() => removeMember(share.workspaceId, m.userId, false).then(() => undefined), `Removed ${m.name} from the event.`)} className="ml-0.5 rounded-full p-0.5 text-ink-faint hover:bg-white">
                    <IconClose size={10} />
                  </button>
                )}
              </span>
            ))}
            {canManageIndividual && !isGroupShare && (
              <button ref={inviteAnchor} type="button" disabled={busy} onClick={() => setOpen((o) => o === 'invite' ? null : 'invite')} aria-expanded={open === 'invite'} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/70 px-2.5 py-1 text-sm font-normal text-lilac-700 shadow-sm transition hover:bg-white disabled:opacity-50">
                <IconPlus size={12} /> Invite
              </button>
            )}
          </div>
          <Popover open={open === 'invite'} onClose={() => setOpen(null)} anchor={inviteAnchor} className="w-56 p-1.5">
            <div aria-label="Invite someone to this event">
              {connected.map((p) => <MenuItem key={p.id} onClick={() => void inviteGuest(p.link!.userId)}>{p.name}</MenuItem>)}
              {!shareLoaded && <p className="px-2.5 py-2 text-xs text-ink-faint">Loading connected people…</p>}
              {shareLoaded && connected.length === 0 && <p className="px-2.5 py-2 text-xs text-ink-faint">No connected people available to invite.</p>}
            </div>
          </Popover>
          {isGroupShare && <p className="mt-1 text-[0.68rem] text-ink-faint">This event is inside a shared group. Invite guests individually after moving it out of that group.</p>}
          {isIndividualShare && share?.pending ? <p className="mt-1 text-[0.68rem] text-ink-faint">{share.pending} invitation{share.pending === 1 ? '' : 's'} awaiting a response.</p> : null}
        </div>
      )}

      <div className="mt-3">
        <span className="block text-xs font-medium text-ink-soft">Shared with</span>
        {isGroupShare ? (
          <p className="mt-1 text-sm font-normal text-ink-faint">Shared through “{share?.name}”. Access is managed from that group.</p>
        ) : (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="People with access">
              {others.filter((m) => task.kind !== 'event' || m.role !== 'viewer').map((m) => (
                <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-sm font-normal text-ink-soft shadow-sm">
                  {m.name}
                  {share?.role === 'owner' ? (
                    <select aria-label={`${m.name}: access permission`} value={m.role} disabled={busy} onChange={(e) => void run(() => setMemberRole(share.workspaceId, m.userId, e.target.value as 'editor' | 'viewer').then(() => undefined), `Updated ${m.name}’s access.`)} className="well rounded-full px-2 py-0.5 text-[0.65rem]">
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                  ) : <span className="text-[0.65rem] text-ink-faint">{m.role === 'editor' ? 'Can edit' : 'Can view'}</span>}
                  {share?.role === 'owner' && (
                    <button type="button" aria-label={`Remove ${m.name} from this item`} onClick={() => void run(() => removeMember(share.workspaceId, m.userId, false).then(() => undefined), `Removed ${m.name}.`)} className="ml-0.5 rounded-full p-0.5 text-ink-faint hover:bg-white">
                      <IconClose size={10} />
                    </button>
                  )}
                </span>
              ))}
              {canManageIndividual && (
                <button ref={shareAnchor} type="button" disabled={busy} onClick={() => setOpen((o) => o === 'share' ? null : 'share')} aria-expanded={open === 'share'} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/70 px-2.5 py-1 text-sm font-normal text-lilac-700 shadow-sm transition hover:bg-white disabled:opacity-50">
                  <IconPlus size={12} /> Share
                </button>
              )}
            </div>
            <Popover open={open === 'share'} onClose={() => setOpen(null)} anchor={shareAnchor} className="w-60 p-2">
              <label className="mb-1 block px-1 text-xs text-ink-soft">Give access</label>
              <select value={shareRole} onChange={(e) => setShareRole(e.target.value as 'editor' | 'viewer')} className="well mb-1.5 w-full rounded-xl px-2.5 py-1.5 text-sm" aria-label="Share permission">
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              {connected.map((p) => <MenuItem key={p.id} onClick={() => void shareWith(p.link!.userId)}>{p.name}</MenuItem>)}
              {!shareLoaded && <p className="px-2.5 py-2 text-xs text-ink-faint">Loading connected people…</p>}
              {shareLoaded && connected.length === 0 && <p className="px-2.5 py-2 text-xs text-ink-faint">No connected people available to share with.</p>}
            </Popover>
          </>
        )}
      </div>

      {share && share.rootTaskId === task.id && (
        share.role === 'owner' ? (
          <button type="button" onClick={() => void run(() => stopSharing(share, false).then(() => undefined), 'Stopped sharing this item.')} className="mt-2 text-xs text-ink-faint transition hover:text-ink">Stop sharing this item</button>
        ) : (
          <button type="button" onClick={() => void run(() => leaveGroup(share, false).then(() => undefined), 'Left the shared item.')} className="mt-2 text-xs text-ink-faint transition hover:text-ink">Leave shared item</button>
        )
      )}
    </Box>
  )
}

/** A line that folds open: for the things most people leave alone (repeats, a separate day to work on it). */
function Twirl({ title, icon, summary, open, onToggle, children }: { title: string; icon?: React.ReactNode; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-1.5 rounded-xl px-1 py-1 text-left text-xs font-medium text-ink-soft transition hover:text-ink">
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          <IconChevron size={13} />
        </span>
        {icon}
        <span>{title}</span>
        {summary && !open && <span className="min-w-0 flex-1 truncate text-right font-normal text-lilac-700">{summary}</span>}
      </button>
      {open && <div className="mt-1.5 space-y-2.5 rounded-2xl bg-white/35 p-3">{children}</div>}
    </div>
  )
}

const BOXES_KEY = 'lilac-boxes'
const boxChoice = (title: string): boolean | undefined => {
  try {
    const v = JSON.parse(localStorage.getItem(BOXES_KEY) ?? '{}')[title]
    return typeof v === 'boolean' ? v : undefined
  } catch {
    return undefined
  }
}
const rememberBox = (title: string, open: boolean) => {
  try {
    localStorage.setItem(BOXES_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(BOXES_KEY) ?? '{}'), [title]: open }))
  } catch {
    /* storage blocked: it just is not remembered */
  }
}

/**
 * A small box that gathers related fields under a name (When, Where, Who…), so a long form reads as a few clear parts. Every box folds
 * away: the whole title row is the button, with an arrow. `startOpen` is false for the things a kind of item rarely needs (a list does
 * not need dates) unless they already hold something.
 */
function Box({ title, icon, children, startOpen = true, summary }: { title: string; icon: React.ReactNode; children: React.ReactNode; startOpen?: boolean; summary?: string }) {
  // a box left folded (or opened) stays that way, for every item and the next time: only a choice made by hand is remembered
  const [open, setOpen] = useState(() => boxChoice(title) ?? startOpen)
  const section = useRef<HTMLElement>(null)
  const toggle = () => {
    setOpen(!open)
    rememberBox(title, !open)
    if (!open) requestAnimationFrame(() => requestAnimationFrame(() => section.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })))
  }
  return (
    <section ref={section} aria-label={title} className={`group-box rounded-2xl p-3 ${open ? 'space-y-2.5' : ''}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-lilac-700/80">
        {icon}
        {title}
        {summary && !open && <span className="ml-auto min-w-0 max-w-[62%] truncate rounded-full bg-white/60 px-2 py-0.5 text-[0.65rem] font-medium normal-case tracking-normal text-ink-soft">{summary}</span>}
        <span className={`${summary && !open ? '' : 'ml-auto'} text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          <IconChevron size={13} />
        </span>
      </button>
      {open && children}
    </section>
  )
}

/**
 * How far along it is: a slider, or a count (12 of 20 essays, 30 of 45 chapters) with a tally counter and number boxes with a keypad.
 * A list with entries works it out from the ones ticked. Whatever sets it, the item moves to the Progress column that percent reaches,
 * and moving it to a column sets the percent.
 */
function ProgressBox({ task, onUseList }: { task: Task; onUseList: () => void }) {
  const setProgress = useStore((s) => s.setProgress)
  const setTally = useStore((s) => s.setTally)
  const pct = progressOf(task)
  const fromList = task.kind === 'list' && task.listStyle === 'check' && task.items.length > 0
  const t = task.tally
  const setStatus = useStore((s) => s.setStatus)
  const [settingCount, setSettingCount] = useState(false)
  const beginCount = () => setSettingCount(true)
  const saveCount = (total: number) => {
    setSettingCount(false)
    if (total > 0) setTally(task.id, { done: 0, total })
  }
  return (
    <Box title="Progress" icon={<IconChart size={13} />} summary={pct + '% complete'}>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={100} step={1} value={pct} disabled={fromList} aria-label="Progress" onChange={(e) => setProgress(task.id, Number(e.target.value))} className="soft mx-0 min-w-0 flex-1 px-3" style={{ ['--fill' as string]: pct + '%' }} />
        <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-lilac-700" aria-live="polite">{pct}%</span>
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-ink-soft">Stage</span>
        <div className="flex gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.id} onClick={() => setStatus(task.id, s.id)} title={s.hint} className={'flex-1 whitespace-nowrap rounded-xl py-1.5 text-sm transition ' + (task.status === s.id ? 'bg-lilac-100 font-medium text-lilac-700 ring-1 ring-lilac-300' : 'bg-white/40 text-ink-soft hover:bg-white/70')}>
              {s.one}
            </button>
          ))}
        </div>
      </div>
      {fromList ? (
        <p className="text-xs text-ink-faint">Worked out from the entries ticked off ({task.items.filter((i) => i.done).length} of {task.items.length}).</p>
      ) : t ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <NumberField label="Items completed" value={t.done} max={t.total} onChange={(n) => setTally(task.id, { ...t, done: n })} />
            <span className="shrink-0 text-sm text-ink-soft">of</span>
            <NumberField label="Total items" value={t.total} min={1} bare onChange={(n) => setTally(task.id, { total: n, done: Math.min(t.done, n) })} className="!h-auto !min-w-0 !rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-sm !font-semibold !text-lilac-700 !shadow-none" />
            <span className="shrink-0 text-sm text-ink-soft">items done</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button type="button" aria-label="One fewer item completed" disabled={t.done <= 0} onClick={() => setTally(task.id, { ...t, done: t.done - 1 })} className="grid h-9 w-9 place-items-center rounded-full bg-lilac-100 text-xl font-medium text-lilac-700 shadow-sm transition hover:bg-lilac-200 active:scale-95 disabled:opacity-40 disabled:active:scale-100">−</button>
              <button type="button" aria-label="One more item completed" disabled={t.done >= t.total} onClick={() => { setTally(task.id, { ...t, done: t.done + 1 }); sound.tickDone() }} className="grid h-9 w-9 place-items-center rounded-full bg-lilac-600 text-xl font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-700 active:scale-95 disabled:opacity-40 disabled:active:scale-100">+</button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <button type="button" onClick={() => setTally(task.id, null)} className="transition hover:text-ink">× Remove Count</button>
            <span aria-hidden> | </span>
            <button type="button" onClick={onUseList} className="transition hover:text-lilac-700">Use list</button>
          </div>
        </div>
      ) : settingCount ? (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <span>Total items</span>
          <NumberField label="Total items" value={0} min={1} onChange={saveCount} autoOpen />
        </div>
      ) : (
        <button type="button" onClick={beginCount} className="text-xs font-medium text-lilac-700 underline decoration-lilac-300 underline-offset-2 transition hover:text-lilac-800">Count items &gt;</button>
      )}
    </Box>
  )
}

/**
 * Something to do (or be at, or keep doing), in the order people reach for things: where it belongs, when it is due, the reminder, then the
 * rest. The type only decides which of these show (it is a layout, not a category): a list adds its entries, a habit leaves out the dates
 * and opens its repeats.
 */
function TaskLayout({ task, links }: { task: Task; links: { href: string; label: string; who: string }[] }) {
  const update = useStore((s) => s.updateTask)
  const habit = task.kind === 'habit'
  const list = task.kind === 'list'
  const [repeatOpen, setRepeatOpen] = useState(() => !!task.repeat || habit)
  const [focusListEntry, setFocusListEntry] = useState(false)
  const [editingNotes, setEditingNotes] = useState(() => !task.notes)
  useEffect(() => setEditingNotes(!task.notes), [task.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const imageCount = task.images?.length || (task.image ? 1 : 0)
  const whenSummary = [task.day || task.due, task.time || task.dueTime].filter(Boolean).join(' · ')
  return (
    <>
      {/* a list is its entries first */}
      {task.kind === 'list' && <ListEditor task={task} autoFocusFirst={focusListEntry} />}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full bg-lilac-100 px-3.5 py-1.5 text-sm text-lilac-700 shadow-sm transition hover:bg-lilac-200">
              {l.label} {l.who}
            </a>
          ))}
        </div>
      )}
      {!habit && (
        <Box title="When" icon={<IconCalendar size={13} />} startOpen={!list || !!(task.day || task.due || task.time || task.dueTime || task.repeat)} summary={whenSummary || (task.repeat ? describeRecurrence(task.repeat) : 'Not scheduled')}>
          <ScheduleFields task={task} />
          {task.kind !== 'list' && (
            <Twirl title="Repeat" icon={<IconRepeat size={13} />} summary={task.repeat ? describeRecurrence(task.repeat) : undefined} open={repeatOpen} onToggle={() => setRepeatOpen((o) => !o)}>
              <RepeatField task={task} />
              {!!task.repeat && <RecentStrip task={task} />}
            </Twirl>
          )}
        </Box>
      )}
      {habit && (
        <Box title="Repeat" icon={<IconRepeat size={13} />} summary={task.repeat ? describeRecurrence(task.repeat) : 'Not repeating'}>
          <RepeatField task={task} />
          <RecentStrip task={task} />
          <ReminderField task={task} />
        </Box>
      )}
      <Box title="Where" icon={<IconPin size={13} />} startOpen={!list || !!task.place} summary={task.place || 'No location'}>
        <PlaceField task={task} />
      </Box>
      <Box title="Images" icon={<IconImage size={13} />} startOpen={!!task.image || !list} summary={imageCount ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : 'No images'}>
        <PictureField task={task} />
      </Box>
      <AssignField task={task} />
      <Box title="Notes" icon={<IconNote size={13} />} startOpen={!task.notes} summary={task.notes ? task.notes.replace(/\s+/g, ' ').slice(0, 48) : 'Add notes'}>
        {editingNotes ? (
          <textarea
            autoFocus
            value={task.notes}
            onChange={(e) => update(task.id, { notes: e.target.value })}
            onBlur={() => setEditingNotes(false)}
            placeholder="Write a note…"
            aria-label="Notes"
            rows={3}
            className="well w-full resize-none rounded-2xl px-3.5 py-2.5 text-sm"
          />
        ) : task.notes ? (
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words px-1 py-1 text-sm leading-relaxed text-ink">{task.notes}</p>
            <button type="button" onClick={() => setEditingNotes(true)} aria-label="Edit notes" title="Edit notes" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-lilac-700">
              <IconPencil size={14} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditingNotes(true)} className="rounded-full bg-white/60 px-3 py-1.5 text-sm text-ink-faint transition hover:bg-white hover:text-lilac-700">
            Add a note…
          </button>
        )}
      </Box>
      {(task.kind === 'task' || task.kind === 'list') && <ProgressBox task={task} onUseList={() => { update(task.id, { kind: 'list', tally: null }); setFocusListEntry(true) }} />}
      {/* both sliders on one line: most people never touch them (the priority grid does the fine tuning) */}
      <Box title="Priority" icon={<IconPriority size={13} />} startOpen={!list || task.importance !== 0.5 || task.urgency !== 0.3} summary={`Importance ${Math.round(task.importance * 100)}% · Urgency ${Math.round(task.urgency * 100)}%`}>
        <div className="grid grid-cols-2 gap-4">
          <SoftSlider label="How much it matters" shown="Importance" compact left="a passing thought" right="super important" value={task.importance} onChange={(v) => update(task.id, { importance: v })} />
          <SoftSlider label="How urgent it is" shown="Urgency" compact left="whenever" right="right away!" value={task.urgency} onChange={(v) => update(task.id, { urgency: v })} actual={effectiveUrgency(task)} actualNote="raised by the deadline" />
        </div>
      </Box>
    </>
  )
}

/**
 * A picture for any item: it becomes the background of its bubble (tinted with the group's colour unless "Tint" is switched off, in which
 * case the bubble's outer ring still takes the colour). An item can have no title at all: the picture is then the reminder.
 */
function PictureField({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const showToast = useStore((s) => s.showToast)
  const input = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const dragTimer = useRef<number | null>(null)
  const touchDragFrom = useRef<number | null>(null)
  const touchDragTo = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [viewerOrigin, setViewerOrigin] = useState<{ left: number; top: number; width: number; height: number } | undefined>()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragTo, setDragTo] = useState<number | null>(null)
  const images = task.images?.length ? task.images : task.image ? [task.image] : []
  const tinted = task.imageTint !== false

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return
    const next = [...images]
    const [picked] = next.splice(from, 1)
    next.splice(to, 0, picked)
    update(task.id, { images: next, image: next[0] })
  }
  const openViewer = (index: number, button: HTMLButtonElement) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    const rect = button.querySelector('img')?.getBoundingClientRect()
    setViewerOrigin(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined)
    setViewer(index)
  }
  const remove = async (at: number) => {
    const ok = await askConfirm({ title: 'Remove this image?', message: 'This image will be removed from this item.', confirmLabel: 'Remove', cancelLabel: 'Keep', danger: true })
    if (!ok) return
    const next = images.filter((_, i) => i !== at)
    update(task.id, { images: next, image: next[0], ...(!next.length ? { imageTint: undefined } : {}) })
    if (viewer !== null) setViewer(null)
  }
  const finishTouchDrag = () => {
    if (dragTimer.current !== null) window.clearTimeout(dragTimer.current)
    dragTimer.current = null
    const from = touchDragFrom.current
    const to = touchDragTo.current
    if (from !== null && to !== null) {
      reorder(from, to)
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
    }
    touchDragFrom.current = null
    touchDragTo.current = null
    setDragFrom(null)
    setDragTo(null)
  }

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <>
          <div
            ref={grid}
            className="grid grid-cols-2 gap-2"
            onPointerMove={(e) => {
              if (touchDragFrom.current === null) return
              const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-image-index]')
              if (target) {
                const index = Number(target.dataset.imageIndex)
                touchDragTo.current = index
                setDragTo(index)
              }
            }}
            onPointerUp={finishTouchDrag}
            onPointerCancel={finishTouchDrag}
          >
            {images.map((src, i) => (
              <div
                key={src + i}
                data-image-index={i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', String(i))
                  setDragFrom(i)
                }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragTo(i) }}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = Number(e.dataTransfer.getData('text/plain'))
                  reorder(from, i)
                  setDragFrom(null)
                  setDragTo(null)
                }}
                onDragEnd={() => { setDragFrom(null); setDragTo(null) }}
                onPointerDown={(e) => {
                  if (e.pointerType !== 'touch') return
                  const from = i
                  dragTimer.current = window.setTimeout(() => {
                    touchDragFrom.current = from
                    touchDragTo.current = from
                    setDragFrom(from)
                    setDragTo(from)
                    grid.current?.setPointerCapture(e.pointerId)
                  }, 280)
                }}
                onPointerUp={() => {
                  if (dragTimer.current !== null) window.clearTimeout(dragTimer.current)
                  dragTimer.current = null
                }}
                className={`group relative touch-none overflow-hidden rounded-2xl border bg-white/40 transition-all ${dragFrom === i ? 'scale-[.96] opacity-60' : ''} ${dragTo === i && dragFrom !== null && dragFrom !== i ? 'border-lilac-500 ring-2 ring-lilac-300' : 'border-white/70'}`}
              >
                <button type="button" onClick={(e) => openViewer(i, e.currentTarget)} aria-label={`View image ${i + 1}`} className="block w-full cursor-grab">
                  <img src={src} alt="" draggable={false} className="h-32 w-full object-cover transition group-hover:scale-[1.02]" />
                </button>
                <span className="pointer-events-none absolute bottom-1.5 left-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">Drag to reorder</span>
                <button type="button" onClick={() => void remove(i)} aria-label={`Remove image ${i + 1}`} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink-soft shadow transition hover:text-danger-deep">
                  <IconClose size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => input.current?.click()} className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-dashed border-lilac-300 bg-white/25 px-3 text-sm text-lilac-700 transition hover:bg-white/65">
              <IconPlus size={14} /> Add images
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-ink-soft">
            <input type="checkbox" checked={tinted} onChange={(e) => update(task.id, { imageTint: e.target.checked ? undefined : false })} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
            Tint images with the group’s color
          </label>
          {viewer !== null && <ImageViewer images={images} initialIndex={viewer} origin={viewerOrigin} onClose={() => setViewer(null)} />}
        </>
      )}
      {images.length === 0 && (
        <button type="button" onClick={() => input.current?.click()} className="glass-soft flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm text-lilac-700 transition hover:bg-white/80">
          <IconPlus size={14} /> Add images
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Choose images"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (!files.length) return
          try {
            const added = await Promise.all(files.map((file) => notionImageFrom(file)))
            const next = [...images, ...added]
            update(task.id, { images: next, image: next[0] })
          } catch (err) {
            showToast((err as Error).message)
          }
        }}
      />
    </div>
  )
}

/** An idea (once called a notion): a scribble on the back of a napkin. Where it belongs, the words (a big box), a picture. Nothing else. */
function NotionFields({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  return (
    <>
      <TagInput taskId={task.id} />
      <textarea
        value={task.notes}
        onChange={(e) => update(task.id, { notes: e.target.value })}
        placeholder="Jot it down: a thought, a link, something to remember…"
        aria-label="Notes"
        rows={9}
        className="well w-full resize-y rounded-2xl px-3.5 py-3 text-sm leading-relaxed"
      />
      <PictureField task={task} />
    </>
  )
}

/** Every editable field of a task, one under another. Used by the side panel and by the quick-add box. */
export function TaskFields({ task, withKind = true }: { task: Task; withKind?: boolean }) {
  const people = useStore((s) => s.people)
  const update = useStore((s) => s.updateTask)
  const linked = people.filter((p) => task.personIds.includes(p.id))
  const links = linked.flatMap((p) => allLinks(p).map((l) => ({ ...l, who: p.name.split(' ')[0] })))
  const kindToggle = withKind && (
    <div className="space-y-1.5">
      <SegmentedToggle label="Type" value={task.kind} options={KINDS} onChange={(k) => update(task.id, { kind: k })} />
      <KindHint kind={task.kind} className="px-0.5" />
    </div>
  )
  return (
    <>
      {kindToggle}
      {task.kind === 'idea' ? <NotionFields task={task} /> : <TaskLayout task={task} links={links} />}
    </>
  )
}

export function TaskDetail() {
  const id = useStore((s) => s.selectedId)
  const live = useStore((s) => s.tasks.find((t) => t.id === s.selectedId))
  const update = useStore((s) => s.updateTask)
  const del = useStore((s) => s.deleteTask)
  const select = useStore((s) => s.select)
  const checkContact = useStore((s) => s.checkContact)
  const titleRef = useRef<HTMLInputElement>(null)
  const [editingTitle, setEditingTitle] = useState(false)

  // keep the last task around so the panel can animate out
  const last = useRef(live)
  if (live) last.current = live
  const task = live ?? last.current
  const { mounted, closing } = useExit(!!id && !!live, 240)

  // "Saved" blinks whenever something about the task changes
  const sig = task ? JSON.stringify([task.title, task.notes, task.kind, task.images, task.image, task.items, task.listStyle, task.time, task.endTime, task.place, task.log, task.repeat, task.remindAt, task.status, task.importance, task.urgency, task.start, task.due, task.day, task.rollover, task.dueRemindAt, task.place, task.days, task.folderIds, task.personIds]) : ''
  const [savedTick, setSavedTick] = useState(0)
  const firstSig = useRef(sig)
  useEffect(() => {
    if (sig !== firstSig.current) setSavedTick((n) => n + 1)
    firstSig.current = sig
  }, [sig])
  useEffect(() => {
    firstSig.current = sig
    setSavedTick(0)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.getAttribute('aria-label') === 'Add tag')) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, select])

  // a fresh, still-unnamed item opens ready to type; an existing one opens as plain text
  useEffect(() => {
    const fresh = !!id && (live?.title === 'New task' || live?.title === '')
    setEditingTitle(fresh)
    if (fresh) requestAnimationFrame(() => titleRef.current?.select())
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!task || !mounted) return null


  return (
    <>
      <div className={`fixed inset-0 z-[var(--z-panel-back)] bg-ink/10 transition-opacity md:hidden ${closing ? 'opacity-0' : 'opacity-100'}`} onClick={() => select(null)} />
      <section
        className={`glass glass-strong fixed inset-x-0 bottom-[var(--kb,0px)] pl-[var(--safe-l)] pr-[var(--safe-r)] md:px-0 z-[var(--z-panel)] flex max-h-[min(88dvh,calc(100dvh-var(--kb,0px)-0.75rem))] flex-col transition-[bottom,max-height] duration-200 ease-out rounded-t-3xl md:inset-x-auto md:bottom-3 md:right-[max(0.75rem,var(--safe-r))] md:top-3 md:max-h-none md:w-[24rem] md:rounded-3xl ${
          closing ? 'slide-out-right' : 'slide-in-right'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Task details"
      >
        <header className="relative z-10 flex shrink-0 items-start gap-3 border-b border-white/65 px-5 pb-3 pt-5 shadow-[0_4px_12px_-12px_rgba(60,40,90,.35)]">
          {/* stays level with the first line of the title when it wraps */}
          <span className="mt-[5px] shrink-0">
            <DoneButton task={task} size={26} />
          </span>
          {editingTitle ? (
            <input
              ref={titleRef}
              autoFocus
              value={task.title}
              onChange={(e) => update(task.id, { title: e.target.value })}
              onBlur={() => {
                checkContact(task.id)
                setEditingTitle(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.stopPropagation()
                  e.currentTarget.blur()
                }
              }}
              placeholder="What’s floating in your mind?"
              aria-label="Title"
              className="well min-w-0 flex-1 rounded-xl px-3 py-1.5 font-display text-xl placeholder:text-ink-faint"
            />
          ) : (
            // plain, easy-to-read text; tap it to edit
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              aria-label="Edit title"
              className={`group flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left font-display text-xl leading-snug transition hover:bg-white/40 ${task.title ? '' : 'text-ink-faint'}`}
            >
              <span className="min-w-0 break-words">{task.title || 'Untitled'}</span>
              <span className="shrink-0 text-ink-faint/70 transition group-hover:text-lilac-600">
                <IconPencil size={14} />
              </span>
            </button>
          )}
          <Tip label="Close">
            <button onClick={() => select(null)} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-ink">
              <IconClose size={16} />
            </button>
          </Tip>
        </header>

        <div className="scroll-soft min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pt-2" style={{ paddingBottom: 'calc(1.5rem + var(--kb, 0px) * 0.5)' }}>
          <TaskFields task={task} />
        </div>

        <footer className="space-y-3 border-t border-white/60 px-5 pb-4 pt-3">
          
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (await askConfirm({ title: 'Delete this item?', message: `“${task.title || 'Untitled'}” will be deleted.`, confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true })) del(task.id)
              }}
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-faint transition hover:text-danger-deep"
            >
              <IconTrash size={14} /> Delete
            </button>
            <span key={savedTick} className={`ml-auto flex items-center gap-1 text-xs text-lilac-600 ${savedTick ? 'saved-blink' : ''}`} aria-live="polite">
              <IconCheck size={13} /> Saved automatically
            </span>
            <button onClick={() => select(null)} className="rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
              Done
            </button>
          </div>
        </footer>
      </section>
    </>
  )
}
