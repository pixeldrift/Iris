import { useEffect, useState } from 'react'

/** Things the quick-add line understands, shown one at a time as faded hints (each one a different kind of detail). */
export const EXAMPLES = [
  'ex. Return library books',
  'ex. Dentist friday at 2:30pm',
  'ex. Yoga every mon/wed/fri 7am',
  'ex. Remind me to call Mom at 5pm',
  'ex. Pay rent every month on the 1st',
  'ex. Study group tomorrow 3-4:30pm',
  'ex. Birthday gift for Mom by oct 31',
  'ex. Water the plants every 2 weeks',
  'ex. idea: a poem about rain',
]

/** Which example to show now: a different one each time it becomes active, then the next every few seconds. */
export function useExampleIndex(active: boolean): number {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!active) return
    setI(Math.floor(Math.random() * EXAMPLES.length))
    const t = window.setInterval(() => setI((h) => h + 1), 3600)
    return () => window.clearInterval(t)
  }, [active])
  return i
}

/** The faded, cross-fading example, laid over an empty field. */
export function ExampleHint({ index, className = '' }: { index: number; className?: string }) {
  return (
    <span key={index} aria-hidden className={`hint-swap pointer-events-none absolute inset-y-0 flex items-center truncate italic text-ink-faint/50 ${className}`}>
      {EXAMPLES[index % EXAMPLES.length]}
    </span>
  )
}
