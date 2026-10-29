/**
 * Keep the field you are typing in on screen. The on-screen keyboard overlays the page, so when a text box takes
 * focus (and again as the keyboard finishes sliding up, or changes height) it is scrolled into the middle of the
 * space that is left, if it is not already fully in view. Covers notes, tag entry, titles, dialogs and sheets alike.
 */
const FIELD = 'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable="true"]'

function reveal(el: Element) {
  const vv = window.visualViewport
  const top = (vv?.offsetTop ?? 0) + 8
  const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12
  const r = el.getBoundingClientRect()
  if (r.top >= top && r.bottom <= bottom) return
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
}

const focused = () => {
  const a = document.activeElement
  return a && a.matches?.(FIELD) ? a : null
}

document.addEventListener('focusin', (e) => {
  const t = e.target as Element
  if (!t.matches?.(FIELD)) return
  // the keyboard takes a moment to arrive, and may resize more than once
  for (const ms of [60, 300, 650]) window.setTimeout(() => focused() === t && reveal(t), ms)
})

let tick = 0
window.visualViewport?.addEventListener('resize', () => {
  window.clearTimeout(tick)
  tick = window.setTimeout(() => {
    const f = focused()
    if (f) reveal(f)
  }, 80)
})
