import { useStore } from '../state/store'

/**
 * With tooltips switched off, the browser's own hover labels (the `title` attributes) are held back too: a title is
 * taken off an element as the pointer arrives and put back when it leaves, so it never gets the chance to show.
 */
const held = new WeakMap<Element, string>()

const over = (e: Event) => {
  for (let el = e.target as Element | null; el && el !== document.body; el = el.parentElement) {
    const t = el.getAttribute('title')
    if (t) {
      held.set(el, t)
      el.removeAttribute('title')
    }
  }
}
const out = (e: Event) => {
  for (let el = e.target as Element | null; el && el !== document.body; el = el.parentElement) {
    const t = held.get(el)
    if (t !== undefined) {
      el.setAttribute('title', t)
      held.delete(el)
    }
  }
}

let on = false
const sync = () => {
  const off = !useStore.getState().settings.tooltips
  if (off === on) return
  on = off
  const f = off ? document.addEventListener.bind(document) : document.removeEventListener.bind(document)
  f('pointerover', over, true)
  f('pointerout', out, true)
}
sync()
useStore.subscribe(sync)
