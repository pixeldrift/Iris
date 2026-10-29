import { useState } from 'react'
import { DEFAULT_STAGES } from '../core/progress'
import type { TaskKind, TaskStatus } from '../core/types'
import { useStore } from '../state/store'
import { DatePicker } from './DatePicker'
import { Modal } from './dialogs'
import { Flower } from './Flower'
import { SegmentedToggle } from './SegmentedToggle'
import { KINDS } from './shared'

/** One row of the editor: tick it to change that field on every selected item; untouched fields are left alone. */
function Field({ on, setOn, label, children }: { on: boolean; setOn: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl px-3 py-2 transition ${on ? 'bg-white/60' : ''}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-lilac-500" />
        <span className={on ? 'font-medium' : 'text-ink-soft'}>{label}</span>
      </label>
      {on && <div className="mt-2">{children}</div>}
    </div>
  )
}

/** Edit several items at once. */
export function BatchEditor({ ids, open, onClose }: { ids: string[]; open: boolean; onClose: () => void }) {
  const update = useStore((s) => s.updateTask)
  const setStatus = useStore((s) => s.setStatus)
  const addToFolder = useStore((s) => s.addToFolder)
  const addPerson = useStore((s) => s.addPerson)
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const [on, setOnAll] = useState<Record<string, boolean>>({})
  const flag = (k: string) => (v: boolean) => setOnAll((o) => ({ ...o, [k]: v }))
  const [status, setSt] = useState<TaskStatus>('doing')
  const [kind, setKind] = useState<TaskKind>('task')
  const [importance, setImportance] = useState(0.5)
  const [urgency, setUrgency] = useState(0.5)
  const [day, setDay] = useState<string | null>(null)
  const [due, setDue] = useState<string | null>(null)
  const [groups, setGroups] = useState<string[]>([])
  const [who, setWho] = useState<string[]>([])
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const any = Object.values(on).some(Boolean)

  const apply = () => {
    for (const id of ids) {
      const patch: Record<string, unknown> = {}
      if (on.kind) patch.kind = kind
      if (on.importance) patch.importance = importance
      if (on.urgency) patch.urgency = urgency
      if (on.day) patch.day = day
      if (on.due) patch.due = due
      if (Object.keys(patch).length) update(id, patch)
      if (on.status) setStatus(id, status)
      if (on.groups) groups.forEach((g) => addToFolder(id, g))
      if (on.who) who.forEach((p) => addPerson(id, p))
    }
    setOnAll({})
    onClose()
  }
  const chip = (active: boolean) => `flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${active ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/60 text-ink-soft hover:bg-white/90'}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      label="Edit several items"
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="ml-auto rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-white/70">
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={!any} className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition disabled:opacity-40">
            Apply to {ids.length} {ids.length === 1 ? 'item' : 'items'}
          </button>
        </div>
      }
    >
      <h3 className="font-display text-xl">Edit {ids.length} items</h3>
      <p className="mb-2 text-xs text-ink-soft">Tick the things to change. Everything else stays as it is on each item.</p>
      <div className="space-y-1">
        <Field on={!!on.status} setOn={flag('status')} label="Progress">
          <SegmentedToggle label="Progress" value={status} options={DEFAULT_STAGES.map((s) => ({ id: s.id as TaskStatus, label: s.name }))} onChange={setSt} />
        </Field>
        <Field on={!!on.kind} setOn={flag('kind')} label="Type">
          <SegmentedToggle label="Type" value={kind} options={KINDS} onChange={setKind} />
        </Field>
        <Field on={!!on.importance} setOn={flag('importance')} label="How much it matters">
          <input type="range" min={0} max={1} step={0.01} value={importance} onChange={(e) => setImportance(Number(e.target.value))} className="soft" aria-label="Importance" />
        </Field>
        <Field on={!!on.urgency} setOn={flag('urgency')} label="How urgent it is">
          <input type="range" min={0} max={1} step={0.01} value={urgency} onChange={(e) => setUrgency(Number(e.target.value))} className="soft" aria-label="Urgency" />
        </Field>
        <Field on={!!on.day} setOn={flag('day')} label="Planned day">
          <DatePicker label="Planned day" value={day} onChange={setDay} />
        </Field>
        <Field on={!!on.due} setOn={flag('due')} label="Due date">
          <DatePicker label="Due by" value={due} onChange={setDue} />
        </Field>
        {folders.length > 0 && (
          <Field on={!!on.groups} setOn={flag('groups')} label="Add to groups">
            <div className="flex flex-wrap gap-1.5">
              {folders.map((f) => (
                <button key={f.id} type="button" onClick={() => toggle(groups, setGroups, f.id)} aria-pressed={groups.includes(f.id)} className={chip(groups.includes(f.id))}>
                  <Flower hue={f.hue} shape={f.shape} size={14} /> {f.name}
                </button>
              ))}
            </div>
          </Field>
        )}
        {people.length > 0 && (
          <Field on={!!on.who} setOn={flag('who')} label="Tag people">
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => toggle(who, setWho, p.id)} aria-pressed={who.includes(p.id)} className={chip(who.includes(p.id))}>
                  {p.name}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  )
}
