import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { ParsedContact } from '../core/people'
import { useStore } from '../state/store'
import { askConfirm, Modal } from './dialogs'
import { canPickContacts, pickContact, readVCard } from './contacts'

interface PersonDialogState {
  open: boolean
  id: string | null
  defaults: Partial<ParsedContact>
  onSaved?: (id: string) => void
}
const usePersonDialog = create<PersonDialogState>(() => ({ open: false, id: null, defaults: {} }))

export function openPerson(opts: { id?: string; defaults?: Partial<ParsedContact>; onSaved?: (id: string) => void } = {}) {
  usePersonDialog.setState({ open: true, id: opts.id ?? null, defaults: opts.defaults ?? {}, onSaved: opts.onSaved })
}
const closePerson = () => usePersonDialog.setState({ open: false })

const field =
  'glass-soft w-full rounded-xl px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:bg-white/80 focus:ring-2 focus:ring-lilac-300/70'

export function PersonDialog() {
  const { open, id, defaults, onSaved } = usePersonDialog()
  const people = useStore((s) => s.people)
  const save = useStore((s) => s.savePerson)
  const del = useStore((s) => s.deletePerson)
  const existing = id ? people.find((p) => p.id === id) : undefined
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setF({ name: '', phone: '', email: '', address: '', notes: '', ...defaults, ...(existing ?? {}) })
  }, [open, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fill = (c: ParsedContact | null) => c && setF((p) => ({ ...p, name: c.name || p.name, phone: c.phone || p.phone, email: c.email || p.email, address: c.address || p.address }))
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <Modal open={open} onClose={closePerson} label={existing ? 'Edit person' : 'Add person'} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim()) return
          const pid = save({ ...f, name: f.name.trim(), ...(existing ? { id: existing.id } : {}) })
          closePerson()
          onSaved?.(pid)
        }}
        className="space-y-3"
      >
        <h3 className="font-display text-xl">{existing ? 'Edit person' : 'Add a person'}</h3>
        <div className="flex flex-wrap gap-2">
          {canPickContacts() && (
            <button type="button" onClick={async () => fill(await pickContact())} className="rounded-full bg-lilac-100 px-3.5 py-1.5 text-xs text-lilac-700 transition hover:bg-lilac-200">
              Choose from contacts
            </button>
          )}
          <button type="button" onClick={() => file.current?.click()} className="rounded-full bg-white/60 px-3.5 py-1.5 text-xs text-ink-soft transition hover:bg-white">
            Import a contact card (.vcf)
          </button>
          <input
            ref={file}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            hidden
            onChange={async (e) => {
              const picked = e.target.files?.[0]
              if (picked) fill(await readVCard(picked))
              e.target.value = ''
            }}
          />
        </div>
        <p className="-mt-1 text-[0.7rem] text-ink-faint">Only the one contact you pick is read. Lilac never sees the rest of your address book.</p>
        <input className={field} placeholder="Name" value={f.name} onChange={set('name')} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <input className={field} placeholder="Phone" inputMode="tel" value={f.phone} onChange={set('phone')} />
          <input className={field} placeholder="Email" inputMode="email" value={f.email} onChange={set('email')} />
        </div>
        <input className={field} placeholder="Address" value={f.address} onChange={set('address')} />
        <textarea className={`${field} resize-none`} rows={2} placeholder="Notes" value={f.notes} onChange={set('notes')} />
        <div className="flex items-center gap-2 pt-1">
          {existing && (
            <button
              type="button"
              onClick={async () => {
                if (await askConfirm({ title: `Remove ${existing.name}?`, message: 'They’ll be untagged from tasks. The tasks stay.', confirmLabel: 'Remove', danger: true })) {
                  closePerson()
                  del(existing.id)
                }
              }}
              className="rounded-full px-3 py-2 text-sm text-ink-faint transition hover:text-[#b04a6e]"
            >
              Remove
            </button>
          )}
          <button type="button" onClick={closePerson} className="ml-auto rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-white/70">
            Cancel
          </button>
          <button type="submit" disabled={!f.name.trim()} className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition disabled:opacity-40">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** "Call Sarah" with no Sarah in People yet: offer to add her details, or decline. */
export function ContactPromptHost() {
  const prompt = useStore((s) => s.contactPrompt)
  const resolve = useStore((s) => s.resolveContact)
  const save = useStore((s) => s.savePerson)
  const add = useStore((s) => s.addPerson)
  const last = useRef(prompt)
  if (prompt) last.current = prompt
  const p = last.current
  if (!p) return null
  const verbWord = p.verb === 'email' ? 'email' : p.verb === 'text' ? 'text' : 'call'
  const first = p.name.split(' ')[0]
  const link = (personId: string) => {
    add(p.taskId, personId)
    useStore.setState({ contactPrompt: null })
  }

  return (
    <Modal open={!!prompt} onClose={() => resolve(null)} label="Add contact details">
      <h3 className="font-display text-xl">Add {first}’s details?</h3>
      <p className="mt-1.5 text-sm text-ink-soft">
        Looks like you want to {verbWord} {p.name}. Add {p.verb === 'email' ? 'an email' : 'a number'} and the bubble gets a one-tap {verbWord} link.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={() => resolve(null)} className="rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-white/70">
          No thanks
        </button>
        {canPickContacts() && (
          <button
            onClick={async () => {
              const c = await pickContact()
              if (c) link(save({ ...c, name: c.name || p.name }))
            }}
            className="rounded-full bg-lilac-100 px-4 py-2 text-sm text-lilac-700 hover:bg-lilac-200"
          >
            Choose from contacts
          </button>
        )}
        <button
          onClick={() => {
            useStore.setState({ contactPrompt: null })
            openPerson({ defaults: { name: p.name }, onSaved: (id) => add(p.taskId, id) })
          }}
          className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30"
        >
          Add details
        </button>
      </div>
    </Modal>
  )
}
