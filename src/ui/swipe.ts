import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import * as sound from '../audio/engine'

/**
 * Swipe a row sideways (touch): left deletes it, right checks it off, or un-checks it if it was done. A line follows the finger across
 * the name as it goes. It only takes over when the finger clearly moves sideways, so scrolling stays vertical, and a press-and-hold that
 * has already picked the row up for the sidebar is never mistaken for it.
 *
 * The gesture only sets a few custom properties and attributes on the row's wrapper (`.swipe`); everything that moves, fades or turns
 * is in `index.css` (`.swipe-*`), driven by them:
 *   --dx        how far the row is pulled (px, signed)
 *   --pull      how far toward committing, 0..1 (the trash lid, the line)
 *   --reach     how far the reveal has shown, 0..1 (the chips and name make room)
 *   --strike    how much of the line is drawn, 0..1
 *   data-dir    'left' | 'right' | '' (what is being pulled toward)
 *   data-phase  'drag' (following the finger) | 'delete' | 'check' (the commit animations) | '' (at rest, or springing back)
 */
const REVEAL_PX = 80

export function useRowSwipe(wrap: RefObject<HTMLElement | null>, done: boolean, onDelete: () => void, onCheck: () => void) {
  return (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return
    const box = wrap.current
    if (!box) return
    const row = box.querySelector<HTMLElement>('.swipe-row')
    if (!row) return
    const sx = e.clientX
    const sy = e.clientY
    const need = Math.min(row.offsetWidth * 0.35, 120)
    const resting = done ? 1 : 0 // (a done item has its line drawn already: swiping it back draws the line off)
    let swiping = false

    const set = (dx: number, strike: number) => {
      box.style.setProperty('--dx', `${dx}px`)
      box.style.setProperty('--pull', String(Math.min(1, Math.abs(dx) / need)))
      box.style.setProperty('--reach', String(Math.min(1, Math.abs(dx) / REVEAL_PX)))
      box.style.setProperty('--strike', String(strike))
    }
    const rest = () => {
      box.dataset.phase = ''
      set(0, resting)
      window.setTimeout(() => {
        if (box.dataset.phase === '') box.dataset.dir = ''
      }, 440)
    }
    const end = (commit: boolean, dx: number) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (!swiping) return
      if (commit && dx < -need) {
        sound.swipeDelete()
        box.dataset.phase = 'delete' // (the lid shuts, then the row sweeps away)
        window.setTimeout(onDelete, 310)
      } else if (commit && dx > need) {
        sound.swipeCheck(done)
        box.dataset.phase = 'check' // (the row springs home with the line at its end while the item is ticked)
        set(0, done ? 0 : 1)
        onCheck()
        window.setTimeout(rest, 340)
      } else rest()
    }
    const move = (ev: PointerEvent) => {
      if (document.body.classList.contains('dragging')) return end(false, 0) // it was picked up to be dragged instead
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!swiping) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return end(false, 0) // a scroll
        if (Math.abs(dx) <= 12 || Math.abs(dx) <= Math.abs(dy) * 1.6) return
        swiping = true
        box.dataset.phase = 'drag'
      }
      box.dataset.dir = dx < 0 ? 'left' : 'right'
      const progress = Math.min(1, Math.max(0, dx) / need)
      set(dx, done ? 1 - progress : progress)
    }
    const up = (ev: PointerEvent) => end(true, ev.clientX - sx)
    const cancel = () => end(false, 0)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
}
