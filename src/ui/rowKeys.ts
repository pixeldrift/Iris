import type { KeyboardEvent } from 'react'

const ROW = '[data-lift-id^="task:"]'

/**
 * Keyboard for a task row (list and board): Tab reaches it, Up and Down step to the neighbouring row (Home and End to the first and
 * last), Enter or Space opens it. Spread the result on the row. Keys pressed inside one of the row's own buttons or fields are
 * left to them, except the arrows, which still move between rows.
 */
export function rowKeys(open: () => void) {
  return {
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const own = e.target === e.currentTarget
      if (own && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        open()
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -Infinity : e.key === 'End' ? Infinity : 0
      if (!step || (e.target as HTMLElement).closest('input,textarea,select')) return
      const rows = [...document.querySelectorAll<HTMLElement>(ROW)].filter((r) => r.offsetParent !== null)
      const at = rows.indexOf(e.currentTarget)
      if (at < 0) return
      const to = rows[Math.max(0, Math.min(rows.length - 1, Number.isFinite(step) ? at + step : step < 0 ? 0 : rows.length - 1))]
      if (to && to !== e.currentTarget) {
        e.preventDefault()
        to.focus()
        to.scrollIntoView({ block: 'nearest' })
      }
    },
  }
}
