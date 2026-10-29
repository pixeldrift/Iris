import { SPRING } from '../lift'
import { CountBubble } from '../shared'
import { IconChevronDown } from '../icons'


export const rowBase =
  'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[calc(0.18rem+var(--sb)*0.28rem)] text-left text-[0.92rem] transition select-none'

export function Count({ n, hideZero = false }: { n: number; hideZero?: boolean }) {
  if (!n && hideZero) return null
  return <CountBubble n={n} className="ml-auto" />
}

/** The app's disclosure arrow: a soft V that turns to point right when closed. */
export function Disclosure({ open, size = 16 }: { open: boolean; size?: number }) {
  return (
    <span
      className="inline-grid place-items-center transition-transform duration-300"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transitionTimingFunction: SPRING }}
    >
      <IconChevronDown size={size} />
    </span>
  )
}

/** Folds shut and open with a smooth height change instead of snapping. */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity,visibility] duration-300"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, visibility: open ? 'visible' : 'hidden', transitionDelay: open ? '0s' : '0s, 0s, 0.3s' }}
    >
      <div inert={!open} className="-mx-1 min-h-0 overflow-hidden px-1">
        {children}
      </div>
    </div>
  )
}

export function Gap({ open }: { open: boolean; id?: string; indent?: number; line?: boolean }) {
  return (
    <div aria-hidden data-gap className="pointer-events-none relative z-10 h-0">
      <div
        className={`absolute inset-x-1 top-[-0.1rem] h-[0.22rem] rounded-full bg-lilac-500 shadow-[0_0_8px_rgb(var(--lr-500)/0.55)] transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

