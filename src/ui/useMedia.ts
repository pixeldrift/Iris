import { useEffect, useState } from 'react'

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setOn(m.matches)
    h()
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [query])
  return on
}

/** Below Tailwind's `md` breakpoint: the sidebar becomes a drawer with a sliver always showing. */
export const useIsMobile = () => useMedia('(max-width: 767px)')

/** A phone turned sideways: wide, but short. The menu then sits beside the content (and can be folded away) instead of sliding over it. */
export const useLandscapePhone = () => useMedia('(orientation: landscape) and (max-height: 500px)')
