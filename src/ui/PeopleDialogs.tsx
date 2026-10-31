import { useEffect, useRef, useState } from 'react'
import { formatPhone } from '../core/locale'
import { create } from 'zustand'
import type { ParsedContact } from '../core/people'
import { useStore } from '../state/store'
import { askConfirm, Modal } from './dialogs'
import type { PersonExtra } from '../core/types'
import { DatePicker } from './DatePicker'
import { IconChevronDown, IconClose, IconHeart, IconLink, IconPencil, IconPlus } from './icons'
import { authClient } from '../sync/auth'
import { disconnectFrom, setFindable, useConnect } from '../sync/connect'
import { openInvite, openShares } from './ConnectDialogs'
import { allCategories, composeAddress, emptyAddress, fullName, MAX_FAVORITES, parseAddress, splitName, type AddressParts } from '../core/people'
import { lookupCity, lookupZip } from './geo'
import { canPickContacts, pickContact } from './contacts'

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

const field = 'well w-full rounded-xl px-3 py-2 text-sm'

const blank = { first: '', last: '', phone: '', email: '', notes: '', favorite: false, categories: [] as string[], extras: [] as PersonExtra[], birthday: null as string | null }

const EXTRA_KINDS: { id: PersonExtra['kind']; label: string; placeholder: string; labels: string[] }[] = [
  { id: 'phone', label: 'Phone', placeholder: 'Phone number', labels: ['Mobile', 'Home', 'Work'] },
  { id: 'email', label: 'Email', placeholder: 'Email address', labels: ['Home', 'Work', 'School'] },
  { id: 'address', label: 'Address', placeholder: 'Street, city, state ZIP', labels: ['Home', 'Work'] },
  { id: 'link', label: 'Website', placeholder: 'https://', labels: ['Website', 'Social'] },
  { id: 'other', label: 'Other', placeholder: 'Detail', labels: ['Note'] },
]

export function PersonDialog() {
  const { open, id, defaults, onSaved } = usePersonDialog()
  const people = useStore((s) => s.people)
  const save = useStore((s) => s.savePerson)
  const del = useStore((s) => s.deletePerson)
  const showToast = useStore((s) => s.showToast)
  const [newCat, setNewCat] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const existing = id ? people.find((p) => p.id === id) : undefined
  const [f, setF] = useState(blank)
  const categories = allCategories([...people, { categories: f.categories }])
  const [line, setLine] = useState('') // the address as one line
  const [parts, setParts] = useState<AddressParts>(emptyAddress())
  const [split, setSplit] = useState(false) // the address as separate boxes
  const [zips, setZips] = useState<string[]>([]) // ZIPs for a typed city, when there is more than one
  const [note, setNote] = useState('')
  const favorites = people.filter((p) => p.favorite && !p.isMe).length
  const connected = useConnect((s) => s.loaded)
  const findable = useConnect((s) => s.me?.findable ?? true)
  const myEmail = useConnect((s) => s.me?.email ?? '')
  const myVerified = useConnect((s) => s.me?.verified ?? true)
  // what a connection keeps up to date for you can't be typed over
  const locked = (k: string) => !!existing?.link?.got.includes(k)

  useEffect(() => {
    if (!open) return
    const base = { ...(defaults as Record<string, string>), ...(existing ?? {}) } as Record<string, string>
    const names = base.first || base.last ? { first: base.first ?? '', last: base.last ?? '' } : splitName(base.name ?? '')
    // new people start hearted while there is room in the sidebar for them
    setF({ ...blank, phone: base.phone ?? '', email: base.email ?? '', notes: base.notes ?? '', ...names, favorite: existing ? existing.favorite && !existing.isMe : favorites < MAX_FAVORITES, categories: existing?.categories ?? [], extras: existing?.extras ?? [], birthday: existing?.birthday ?? null })
    const known = base.street || base.city || base.state || base.zip ? { street: base.street ?? '', city: base.city ?? '', state: base.state ?? '', zip: base.zip ?? '' } : parseAddress(base.address ?? '')
    setParts(known)
    setLine(base.address || composeAddress(known))
    setSplit(false)
    setZips([])
    setNote('')
  }, [open, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fill = (c: ParsedContact | null) => {
    if (!c) return
    const n = splitName(c.name)
    setF((p) => ({ ...p, first: n.first || p.first, last: n.last || p.last, phone: c.phone || p.phone, email: c.email || p.email }))
    if (c.address) {
      setLine(c.address)
      setParts(parseAddress(c.address))
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const editLine = (v: string) => {
    setLine(v)
    setParts(parseAddress(v))
  }
  const editPart = (k: keyof AddressParts, v: string) => {
    const next = { ...parts, [k]: k === 'state' ? v.toUpperCase().slice(0, 2) : k === 'zip' ? v.replace(/\D/g, '').slice(0, 5) : v }
    setParts(next)
    setLine(composeAddress(next))
  }
  const applyParts = (next: AddressParts) => {
    setParts(next)
    setLine(composeAddress(next))
  }

  // Whichever of ZIP or city is typed first fills in the other: a ZIP gives city and state; a city and state give its ZIP(s).
  useEffect(() => {
    if (!open) return
    let live = true
    const timer = window.setTimeout(async () => {
      if (/^\d{5}$/.test(parts.zip) && (!parts.city.trim() || !parts.state.trim())) {
        const hit = await lookupZip(parts.zip)
        if (live && hit) {
          applyParts({ ...parts, city: parts.city.trim() || hit.city, state: parts.state.trim() || hit.state })
          setNote(`City and state filled in from ${parts.zip}`)
        }
      } else if (!parts.zip && parts.city.trim().length > 2 && /^[A-Za-z]{2}$/.test(parts.state)) {
        const found = await lookupCity(parts.city, parts.state)
        if (!live) return
        if (found.length === 1) {
          applyParts({ ...parts, zip: found[0] })
          setNote(`ZIP filled in from ${parts.city.trim()}, ${parts.state}`)
          setZips([])
        } else setZips(found)
      } else setZips([])
    }, 600)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [parts.zip, parts.city, parts.state, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const name = fullName(f.first, f.last)

  return (
    <Modal
      open={open}
      onClose={closePerson}
      footer={
        <div className="flex items-center gap-2">
    {existing && !existing.isMe && (
      <button
        type="button"
        onClick={async () => {
          if (await askConfirm({ title: `Remove ${existing.name}?`, message: existing.link ? 'They’ll be untagged from tasks, and your connection ends. The tasks stay.' : 'They’ll be untagged from tasks. The tasks stay.', confirmLabel: 'Remove', danger: true })) {
            closePerson()
            const live = existing.link ? useConnect.getState().connections.find((c) => c.userId === existing.link!.userId && c.status === 'accepted') : undefined
            if (live) void disconnectFrom(live.id).catch(() => undefined)
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
    <button type="submit" form="person-form" disabled={!name} className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition disabled:opacity-40">
      Save
    </button>
  </div>
      }
      label={existing ? 'Edit person' : 'Add person'} wide>
      <form
        id="person-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name) return
          const pid = save({ ...f, extras: f.extras.filter((x) => x.value.trim()), name, ...parts, address: composeAddress(parts), ...(existing ? { id: existing.id } : {}) })
          closePerson()
          onSaved?.(pid)
          // a new address that could belong to someone on Lilac: offer to connect (once per address)
          const saved = useStore.getState().people.find((p) => p.id === pid)
          const mail = saved?.email.trim().toLowerCase() ?? ''
          if (connected && saved && !saved.isMe && !saved.link && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) && saved.invited !== mail && mail !== myEmail.toLowerCase()) openInvite(saved)
        }}
        className="space-y-3"
      >
        <div className="flex items-center">
          <h3 className="font-display text-xl">{existing?.isMe ? 'My Profile' : existing ? 'Edit person' : 'Add a person'}</h3>
          {/* you are linked to everything you make already, so there is nothing to keep in the sidebar */}
          {!existing?.isMe && (
            <button
              type="button"
              onClick={() => {
                if (!f.favorite && favorites - (existing?.favorite ? 1 : 0) >= MAX_FAVORITES) return showToast(`The sidebar keeps ${MAX_FAVORITES} favorites. Unheart someone to make room.`)
                setF((p) => ({ ...p, favorite: !p.favorite }))
              }}
              aria-pressed={f.favorite}
              aria-label={f.favorite ? 'Remove from sidebar' : 'Keep in the sidebar'}
              title={f.favorite ? 'In your sidebar' : 'Heart to keep in the sidebar'}
              className={`ml-auto flex h-9 items-center gap-1.5 rounded-full pl-3 pr-2.5 text-sm transition hover:bg-white/70 ${f.favorite ? 'text-lilac-600' : 'text-ink-soft'}`}
            >
              Favorite
              <span className="text-lilac-500">
                <IconHeart size={19} filled={f.favorite} />
              </span>
            </button>
          )}
        </div>
        {existing && !existing.isMe && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {existing.link ? (
              <>
                <span className="flex items-center gap-1.5 rounded-full bg-lilac-100 px-2.5 py-1 text-lilac-700" title="Their details are kept up to date by their own account">
                  <IconLink size={13} /> Connected
                </span>
                <span className="text-ink-faint">{existing.link.got.length ? 'Kept up to date by them' : 'They aren’t sharing any details yet'}</span>
                <button type="button" onClick={() => openShares(existing)} className="rounded-full px-2.5 py-1 text-lilac-700 transition hover:bg-lilac-100/80">
                  What I share…
                </button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-1 text-ink-soft" title="You keep this entry yourself">
                  <IconPencil size={13} /> Added by you
                </span>
                {connected && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(existing.email.trim()) && existing.email.trim().toLowerCase() !== myEmail.toLowerCase() && (
                  <button type="button" onClick={() => openInvite(existing)} className="rounded-full px-2.5 py-1 text-lilac-700 transition hover:bg-lilac-100/80">
                    Invite to connect
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {canPickContacts() && (
            <button type="button" onClick={async () => fill(await pickContact())} className="rounded-full bg-lilac-100 px-3.5 py-1.5 text-xs text-lilac-700 transition hover:bg-lilac-200">
              Choose from contacts
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={`${field} disabled:opacity-60`} placeholder="First name" aria-label="First name" autoComplete="given-name" value={f.first} onChange={set('first')} autoFocus={!existing} disabled={locked('name')} />
          <input className={`${field} disabled:opacity-60`} placeholder="Last name" aria-label="Last name" autoComplete="family-name" value={f.last} onChange={set('last')} disabled={locked('name')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={`${field} disabled:opacity-60`} disabled={locked('phone')} placeholder="Phone" inputMode="tel" value={f.phone} onChange={set('phone')} onBlur={() => setF((p) => ({ ...p, phone: formatPhone(p.phone) }))} />
          <input className={`${field} disabled:opacity-60`} disabled={locked('email')} placeholder="Email" inputMode="email" value={f.email} onChange={set('email')} />
        </div>
        {/* any number of further numbers, emails, addresses…, each with a label of its own */}
        {f.extras.map((x) => {
          const kind = EXTRA_KINDS.find((k) => k.id === x.kind)!
          const patch = (p: Partial<PersonExtra>) => setF((cur) => ({ ...cur, extras: cur.extras.map((e) => (e.id === x.id ? { ...e, ...p } : e)) }))
          return (
            <div key={x.id} className="flex items-center gap-1.5">
              <input list={`labels-${x.kind}`} className={`${field} !w-24 shrink-0`} placeholder={kind.label} aria-label={`${kind.label} label`} value={x.label} onChange={(e) => patch({ label: e.target.value })} />
              <datalist id={`labels-${x.kind}`}>
                {kind.labels.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
              <input
                className={`${field} min-w-0 flex-1`}
                placeholder={kind.placeholder}
                aria-label={`${kind.label} ${x.label}`}
                inputMode={x.kind === 'phone' ? 'tel' : x.kind === 'email' ? 'email' : x.kind === 'link' ? 'url' : undefined}
                value={x.value}
                onChange={(e) => patch({ value: e.target.value })}
                onBlur={() => x.kind === 'phone' && patch({ value: formatPhone(x.value) })}
              />
              <button type="button" onClick={() => setF((cur) => ({ ...cur, extras: cur.extras.filter((e) => e.id !== x.id) }))} aria-label={`Remove ${kind.label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-[#b04a6e]">
                <IconClose size={12} />
              </button>
            </div>
          )
        })}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* (an existing "Other" entry still shows; it just can't be added any more) */}
          {EXTRA_KINDS.filter((k) => k.id !== 'other').map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setF((cur) => ({ ...cur, extras: [...cur.extras, { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), kind: k.id, label: k.labels[0], value: '' }] }))}
              className="flex items-center gap-1 rounded-full bg-white/50 px-2.5 py-1 text-xs text-lilac-700 transition hover:bg-white/80"
            >
              <IconPlus size={11} /> {k.label}
            </button>
          ))}
        </div>
        <DatePicker label="Birthday" value={f.birthday} onChange={(v) => setF((cur) => ({ ...cur, birthday: v }))} />
        <div>
          <div className="flex items-center gap-1.5">
            {/* open: this box is just the street (the rest has its own boxes below); closed: the whole address on one line */}
            <input
              className={field}
              placeholder={split ? 'Street' : 'Address'}
              aria-label={split ? 'Street' : 'Address'}
              autoComplete="street-address"
              value={split ? parts.street : line}
              onChange={(e) => (split ? editPart('street', e.target.value) : editLine(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setSplit((x) => !x)}
              aria-expanded={split}
              aria-label={split ? 'Hide address parts' : 'Show street, city, state and ZIP separately'}
              title={split ? 'One line' : 'Street, city, state, ZIP'}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-ink"
            >
              <span className={`transition-transform ${split ? 'rotate-180' : ''}`}>
                <IconChevronDown size={15} />
              </span>
            </button>
          </div>
          {split && (
            <div className="mt-2 grid grid-cols-6 gap-2">
              <input className={`${field} col-span-3`} placeholder="City" aria-label="City" autoComplete="address-level2" value={parts.city} onChange={(e) => editPart('city', e.target.value)} />
              <input className={`${field} col-span-1`} placeholder="State" aria-label="State" autoComplete="address-level1" maxLength={2} value={parts.state} onChange={(e) => editPart('state', e.target.value)} />
              <input className={`${field} col-span-2`} placeholder="ZIP" aria-label="ZIP" autoComplete="postal-code" inputMode="numeric" value={parts.zip} onChange={(e) => editPart('zip', e.target.value)} />
            </div>
          )}
          {zips.length > 1 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
              ZIP for {parts.city.trim()}?
              {zips.map((z) => (
                <button key={z} type="button" onClick={() => (applyParts({ ...parts, zip: z }), setZips([]))} className="rounded-full bg-lilac-100 px-2 py-0.5 text-lilac-700 hover:bg-lilac-200">
                  {z}
                </button>
              ))}
            </div>
          )}
          {note && <p className="mt-1 text-[0.7rem] text-ink-faint">{note}</p>}
        </div>
        {!existing?.isMe && (
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-soft">Category</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((c) => {
                const on = f.categories.some((x) => x.toLowerCase() === c.toLowerCase())
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setF((p) => ({ ...p, categories: on ? p.categories.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...p.categories, c] }))}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${on ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
                  >
                    {c}
                  </button>
                )
              })}
              {addingCat ? (
                <input
                  autoFocus
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onBlur={() => {
                    setAddingCat(false)
                    setNewCat('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setAddingCat(false)
                      setNewCat('')
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const c = newCat.trim()
                      if (c && !f.categories.some((x) => x.toLowerCase() === c.toLowerCase())) setF((p) => ({ ...p, categories: [...p.categories, c] }))
                      setAddingCat(false)
                      setNewCat('')
                    }
                  }}
                  placeholder="New category"
                  aria-label="New category"
                  className="well w-32 rounded-full px-3 py-1 text-xs"
                />
              ) : (
                <button type="button" onClick={() => setAddingCat(true)} className="rounded-full bg-white/50 px-2.5 py-1 text-xs text-lilac-700 transition hover:bg-white/80">
                  + New
                </button>
              )}
            </div>
          </div>
        )}
        <textarea className={`${field} resize-none`} rows={2} placeholder="Notes" value={f.notes} onChange={set('notes')} />
        {existing?.isMe && <p className="text-xs text-ink-faint">Appears in address book</p>}
        {existing?.isMe && connected && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-1 py-1 text-sm">
            <input type="checkbox" checked={findable} onChange={(e) => void setFindable(e.target.checked).catch(() => showToast('Couldn’t change that. Try again.'))} className="mt-0.5 h-4 w-4 accent-[var(--color-lilac-500)]" />
            <span>
              Let people who have my email find me
              <span className="block text-xs text-ink-faint">They can send a request to connect. Nobody learns whether you use Lilac unless you accept. Your details are only shared when you say so.</span>
            </span>
          </label>
        )}
        {existing?.isMe && connected && !myVerified && (
          <p role="status" className="rounded-xl bg-white/60 px-3 py-2 text-xs text-ink-soft">
            Your email isn’t confirmed, so other people can’t find you yet and invitations to you won’t arrive. Once it’s confirmed, requests will start reaching you.
            <button
              type="button"
              className="ml-1 text-lilac-700 underline-offset-2 hover:underline"
              onClick={async () => {
                const r = await authClient.sendVerificationEmail({ email: myEmail, callbackURL: window.location.origin }).catch(() => ({ error: true }))
                showToast(r && 'error' in r && r.error ? 'Couldn’t send that. Try again in a moment.' : `Confirmation link sent to ${myEmail}`)
              }}
            >
              Send me the confirmation link
            </button>
          </p>
        )}
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
    <Modal
      open={!!prompt}
      onClose={() => resolve(null)}
      label="Add contact details"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
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
      }
    >
      <h3 className="font-display text-xl">Add {first}’s details?</h3>
      <p className="mt-1.5 text-sm text-ink-soft">
        Looks like you want to {verbWord} {p.name}. Add {p.verb === 'email' ? 'an email' : 'a number'} and the bubble gets a one-tap {verbWord} link.
      </p>
    </Modal>
  )
}
