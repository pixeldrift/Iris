import { useEffect, useRef, useState } from 'react'

/**
 * Keep something mounted long enough to play its exit animation.
 * `shown` mirrors `open` but lags on close; `closing` is true during the exit.
 */
export function useExit(open: boolean, ms = 220) {
  const [shown, setShown] = useState(open)
  const timer = useRef<number>(0)
  useEffect(() => {
    window.clearTimeout(timer.current)
    if (open) setShown(true)
    else timer.current = window.setTimeout(() => setShown(false), ms)
    return () => window.clearTimeout(timer.current)
  }, [open, ms])
  return { mounted: open || shown, closing: !open && shown }
}
