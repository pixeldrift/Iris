import type { ReactNode } from 'react'

const Svg = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
)

type P = { size?: number }
export const IconPond = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="7" opacity=".6" />
    <circle cx="12" cy="12" r="10.5" opacity=".3" />
  </Svg>
)
export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5Z" />
  </svg>
)
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3v-12Z" />
    <circle cx="12" cy="10" r="2" />
    <path d="M8.5 15.5c.6-1.7 2-2.5 3.5-2.5s2.9.8 3.5 2.5" />
  </Svg>
)
export const IconRepeat = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Svg>
)
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
)
export const IconPerson = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Svg>
)
/** Settings: three sliders. (Kept the old name; it is no longer a gear.) */
export const IconGear = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h7M17 7h3M4 12h3M13 12h7M4 17h9M19 17h1" />
    <circle cx="14" cy="7" r="2.2" />
    <circle cx="10" cy="12" r="2.2" />
    <circle cx="16" cy="17" r="2.2" />
  </Svg>
)
export const IconSignOut = (p: P) => (
  <Svg {...p}>
    <path d="M9 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H9" />
    <path d="M14 8l4 4-4 4M18 12H9.5" />
  </Svg>
)
export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r=".8" />
    <circle cx="4.5" cy="12" r=".8" />
    <circle cx="4.5" cy="18" r=".8" />
  </Svg>
)
export const IconBoard = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="5" height="16" rx="1.6" />
    <rect x="10" y="4" width="5" height="10" rx="1.6" />
    <rect x="16.5" y="4" width="4" height="13" rx="1.6" />
  </Svg>
)
export const IconPriority = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M12 3.5v17M3.5 12h17" opacity=".6" />
  </Svg>
)
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </Svg>
)
export const IconTimeline = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M8 12h12M6 17h8" />
  </Svg>
)
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
)
export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
  </Svg>
)
export const IconSound = (p: P) => (
  <Svg {...p}>
    <path d="M4 10v4h4l5 4V6L8 10H4Z" />
    <path d="M16.5 9a4 4 0 0 1 0 6" />
  </Svg>
)
export const IconSoundOff = (p: P) => (
  <Svg {...p}>
    <path d="M4 10v4h4l5 4V6L8 10H4Z" />
    <path d="m17 9 4 6M21 9l-4 6" />
  </Svg>
)
export const IconWind = (p: P) => (
  <Svg {...p}>
    <path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h8" />
  </Svg>
)
export const IconDrift = (p: P) => (
  <Svg {...p}>
    <path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" />
  </Svg>
)
export const IconSize = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="3.5" />
    <circle cx="16" cy="9" r="5.5" />
  </Svg>
)
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
)
export const IconInbox = (p: P) => (
  <Svg {...p}>
    <path d="M4 13l2.5-7h11L20 13v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-5Z" />
    <path d="M4 13h5l1 2h4l1-2h5" />
  </Svg>
)
export const IconAll = (p: P) => (
  <Svg {...p}>
    <path d="M12 3c2 3 2 6 0 9 2-3 5-4 9-4-1 4-4 6-9 6 4 0 7 2 8 6-4 0-7-1-9-4 0 3-1 5-3 7-2-2-3-4-3-7-2 3-5 4-9 4 1-4 4-6 8-6-5 0-8-2-9-6 4 0 7 1 9 4-2-3-2-6 0-9Z" opacity="0" />
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5c-3 3-3 14 0 17M12 3.5c3 3 3 14 0 17M3.5 12h17" opacity=".6" />
  </Svg>
)
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)
export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5Z" />
  </Svg>
)
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)
export const IconPhone = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1.5 1.5 0 0 1-1.6 1.5C10.4 20 4 13.6 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />
  </Svg>
)
export const IconMail = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m4 8 8 6 8-6" />
  </Svg>
)
export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 6.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H7a2.5 2.5 0 0 1-2.5-2.5v-7Z" />
  </Svg>
)
export const IconThought = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 15.5a3.6 3.6 0 0 1-.5-7.1A4.8 4.8 0 0 1 16.2 7a3.8 3.8 0 0 1 .7 8.5H7.5Z" />
    <circle cx="7" cy="19" r="1.2" />
    <circle cx="4.2" cy="21.2" r="0.8" />
  </Svg>
)
export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
)
/** A soft V with a rounded point: the app's disclosure arrow (rotate -90deg for "closed"). */
export const IconChevronDown = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9.5 10.6 14a2 2 0 0 0 2.8 0L18 9.5" />
  </svg>
)

export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M9 14 4.5 9.5 9 5" />
    <path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />
  </Svg>
)
export const IconRedo = (p: P) => (
  <Svg {...p}>
    <path d="m15 14 4.5-4.5L15 5" />
    <path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h3" />
  </Svg>
)
export const IconZoom = ({ plus, ...p }: P & { plus: boolean }) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5 5" />
    <path d={plus ? 'M8 10.5h5M10.5 8v5' : 'M8 10.5h5'} />
  </Svg>
)
