import { useRef } from 'react'
import type { Scope } from '../../core/types'
import { useStore } from '../../state/store'

/**
 * Adding a filter to the ones already on: shift/⌘/ctrl-click with a mouse, or a long press with a finger.
 * `click` says whether the click was one of those (and so is already dealt with).
 */
export function useFilterPress(part: Scope) {
  const toggle = useStore((s) => s.toggleFilter)
  const timer = useRef(0)
  const long = useRef(false)
  const cancel = () => window.clearTimeout(timer.current)
  return {
    down: (e: React.PointerEvent) => {
      long.current = false
      cancel()
      if (e.pointerType === 'touch')
        timer.current = window.setTimeout(() => {
          long.current = true
          navigator.vibrate?.(10)
          toggle(part)
        }, 500)
    },
    cancel,
    click: (e: React.MouseEvent): boolean => {
      cancel()
      if (long.current) {
        long.current = false
        return true
      }
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        toggle(part)
        return true
      }
      return false
    },
  }
}
