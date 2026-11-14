import { useRef, useState } from 'react'
import { IconChevron } from './icons'

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
export function Box({ title, icon, children, startOpen = true, summary }: { title: string; icon: React.ReactNode; children: React.ReactNode; startOpen?: boolean; summary?: string }) {
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
