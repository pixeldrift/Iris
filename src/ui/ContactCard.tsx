import { useStore } from '../state/store'
import { formatBirthday } from '../core/locale'
import type { Person } from '../core/types'
import { IconBuilding, IconCake, IconGlobe, IconHeart, IconMail, IconPhone, IconPin } from './icons'
import { Avatar } from './shared'

const tel = (v: string) => `tel:${v.replace(/[^\d+]/g, '')}`
const web = (v: string) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
const map = (v: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`

function Row({ icon, label, href, children }: { icon: React.ReactNode; label?: string; href?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-100/80 text-lilac-600">{icon}</span>
      <div className="min-w-0 flex-1">
        {label && <div className="text-[0.68rem] leading-none text-ink-faint">{label}</div>}
        {href ? (
          <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className="block break-words text-sm text-lilac-700 underline-offset-2 hover:underline">
            {children}
          </a>
        ) : (
          <div className="break-words text-sm text-ink">{children}</div>
        )}
      </div>
    </li>
  )
}

/** A contact as plain text: phone numbers, emails, addresses and sites are links that do something. */
export function ContactCard({ person, status }: { person: Person; status?: React.ReactNode }) {
  const toggle = useStore((s) => s.togglePersonFavorite)
  const extras = (person.extras ?? []).filter((x) => x.value.trim())
  const iconFor = (k: string) => (k === 'phone' ? <IconPhone size={15} /> : k === 'email' ? <IconMail size={15} /> : k === 'address' ? <IconPin size={15} /> : <IconGlobe size={15} />)
  const hrefFor = (k: string, v: string) => (k === 'phone' ? tel(v) : k === 'email' ? `mailto:${v}` : k === 'address' ? map(v) : k === 'link' ? web(v) : undefined)
  const empty = !person.phone && !person.email && !person.address && !person.birthday && !person.company && !extras.length && !person.notes && !(person.categories ?? []).length
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-3.5">
        <Avatar person={person} size={64} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-display text-2xl leading-tight">{person.name}</h3>
          {person.company && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
              <IconBuilding size={14} />
              <span className="min-w-0 break-words">{person.company}</span>
            </p>
          )}
        </div>
        {!person.isMe && (
          <button
            type="button"
            onClick={() => toggle(person.id)}
            aria-pressed={person.favorite}
            aria-label={person.favorite ? 'Remove from sidebar' : 'Keep in the sidebar'}
            title={person.favorite ? 'In your sidebar' : 'Heart to keep in the sidebar'}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lilac-500 transition hover:bg-white/70 ${person.favorite ? '' : 'opacity-60'}`}
          >
            <IconHeart size={20} filled={person.favorite} />
          </button>
        )}
      </div>
      {status}
      {(person.categories ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {person.categories!.map((c) => (
            <span key={c} className="rounded-full bg-lilac-100 px-2.5 py-0.5 text-xs text-lilac-700">
              {c}
            </span>
          ))}
        </div>
      )}
      <ul className="space-y-2.5">
        {person.phone && (
          <Row icon={<IconPhone size={15} />} label="Phone" href={tel(person.phone)}>
            {person.phone}
          </Row>
        )}
        {person.email && (
          <Row icon={<IconMail size={15} />} label="Email" href={`mailto:${person.email}`}>
            {person.email}
          </Row>
        )}
        {extras.map((x) => (
          <Row key={x.id} icon={iconFor(x.kind)} label={x.label || undefined} href={hrefFor(x.kind, x.value)}>
            {x.value}
          </Row>
        ))}
        {person.address && (
          <Row icon={<IconPin size={15} />} label="Address" href={map(person.address)}>
            {person.address}
          </Row>
        )}
        {person.birthday && (
          <Row icon={<IconCake size={15} />} label="Birthday">
            {formatBirthday(person.birthday)}
          </Row>
        )}
      </ul>
      {person.notes && <p className="whitespace-pre-wrap rounded-2xl bg-white/45 px-3 py-2.5 text-sm text-ink-soft">{person.notes}</p>}
      {empty && <p className="text-sm text-ink-faint">No details yet. Tap Edit to add some.</p>}
    </div>
  )
}
