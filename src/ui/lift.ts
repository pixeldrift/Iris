/**
 * Lift & drop for draggable list items.
 *
 * Picking an item up puts a lifted copy (a clone of its DOM) under the finger and the
 * original fades in place. On release the lifted copy lands one of three ways:
 *   - the item ended up somewhere else (a re-sorted folder, a card in another column):
 *     the copy glides to its new slot with a gentle spring while the old copy shrinks away;
 *   - it was dropped on a target that only tags it (folder, person, day): the copy shrinks into it;
 *   - it was dropped nowhere: the copy springs back to where it came from.
 * Items are found again after the drop through `data-lift-id="<type>:<id>"`.
 */
export const SPRING = 'cubic-bezier(0.34, 1.32, 0.5, 1)' // mild overshoot, calmer than the pond's bubbles
const SHADOW = '0 20px 44px -14px rgba(107, 68, 145, 0.5), 0 6px 14px -6px rgba(107, 68, 145, 0.3)'

interface Active {
  el: HTMLElement
  wrap: HTMLElement
  clone: HTMLElement
  key: string
  ox: number
  oy: number
  /** Width of the lifted copy: wide rows lift as a compact card so it stays under the finger. */
  cw: number
}
const COMPACT = 280
let active: Active | null = null

function strip(n: HTMLElement) {
  for (const a of ['data-lift-id', 'data-drop', 'data-flip', 'id']) n.removeAttribute(a)
  n.querySelectorAll('[data-lift-id],[data-drop],[data-flip],[id]').forEach((c) => {
    for (const a of ['data-lift-id', 'data-drop', 'data-flip', 'id']) c.removeAttribute(a)
  })
}

function copyOf(el: HTMLElement, r: DOMRect) {
  const clone = el.cloneNode(true) as HTMLElement
  strip(clone)
  Object.assign(clone.style, { width: `${r.width}px`, height: `${r.height}px`, margin: '0', opacity: '1', transform: 'none', transition: 'none' })
  clone.classList.remove('opacity-40', 'rise-in', 'pop-in')
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:100;pointer-events:none;will-change:transform;'
  wrap.style.transform = `translate(${r.left}px, ${r.top}px)`
  wrap.appendChild(clone)
  document.body.appendChild(wrap)
  return { wrap, clone }
}

/** Where the lifted copy sits for a pointer at (x, y): on the grab point, but never off-screen. */
function place(a: Active, x: number, y: number) {
  const h = a.clone.offsetHeight
  return {
    x: Math.min(window.innerWidth - a.cw - 8, Math.max(8, x - a.ox)),
    y: Math.min(window.innerHeight - h - 8, Math.max(8, y - a.oy)),
  }
}
const nextFrames = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))
const at = (x: number, y: number) => `translate(${x}px, ${y}px)`

export const lifter = {
  begin(el: HTMLElement, px: number, py: number, key: string, opaque = false) {
    this.cancel()
    const r = el.getBoundingClientRect()
    const { wrap, clone } = copyOf(el, r)
    clone.style.boxShadow = SHADOW
    if (opaque) clone.style.background = '#fbf7fd'
    clone.style.borderRadius = getComputedStyle(el).borderRadius
    const cw = Math.min(r.width, COMPACT)
    clone.style.width = `${cw}px`
    clone.style.overflow = 'hidden'
    if (cw < r.width) clone.classList.add('lift-compact')
    // picked up: it swells a touch past its lifted size, then settles
    clone.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.065)' }, { transform: 'scale(1.04)' }], { duration: 340, easing: SPRING, fill: 'forwards' })
    // keep the grab point in the same proportion across the (possibly narrower) copy
    active = { el, wrap, clone, key, ox: ((px - r.left) / r.width) * cw, oy: py - r.top, cw }
    this.move(px, py)
  },

  move(x: number, y: number) {
    if (!active) return
    const p = place(active, x, y)
    active.wrap.style.transform = at(p.x, p.y)
  },

  /**
   * Indent the lifted copy from the left (px), narrowing it while its right edge stays put,
   * so a carried folder shows how deep it would sit.
   */
  setInset(px: number) {
    if (!active) return
    const c = active.clone
    if (px === 0 && !c.style.marginLeft) return
    c.style.transition = 'margin-left 0.18s ease-out, width 0.18s ease-out'
    c.style.marginLeft = `${px}px`
    // measured from the row's own width (a nested row is already narrower than the list), so the right edge never overshoots
    c.style.width = `${active.cw - px}px`
    c.style.paddingLeft = px ? '0.6rem' : ''
  },

  /** Vertical centre of the lifted copy on screen: where the item visibly is, whatever the grab point. */
  centerY(): number | null {
    if (!active) return null
    const r = active.clone.getBoundingClientRect()
    return r.top + r.height / 2
  },

  cancel() {
    active?.wrap.remove()
    active = null
  },

  /** Call after the drop has been applied to the store (React renders on the next frames). */
  end(target: string | null, x: number, y: number) {
    const a = active
    active = null
    if (!a) return
    const { el, wrap, clone, key } = a
    const cur = el.getBoundingClientRect()
    const from = place(a, x, y)

    // keep the real item invisible until the lifted copy has landed on it
    const hide = document.createElement('style')
    hide.textContent = `[data-lift-id="${key}"]{opacity:0 !important}`
    document.head.appendChild(hide)
    document.body.dataset.landing = key
    // the old copy, left behind where the item was picked up
    const old = copyOf(el, cur)
    old.clone.style.opacity = '0.4'
    old.wrap.style.zIndex = '90'

    let done = false
    const finish = (dest?: Element | null) => {
      if (done) return
      done = true
      wrap.remove()
      old.wrap.remove()
      hide.remove()
      delete document.body.dataset.landing
      dest?.animate([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 280, easing: SPRING })
    }
    window.setTimeout(() => finish(document.querySelector(`[data-lift-id="${key}"]`)), 1600)

    nextFrames(() => {
      const dest = document.querySelector(`[data-lift-id="${key}"]`)
      if (!dest) {
        // the item is gone (deleted, filtered out): let the copy melt away
        old.wrap.remove()
        wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => finish(null)
        return
      }
      const r1 = dest.getBoundingClientRect()
      const moved = Math.abs(r1.left - cur.left) > 6 || Math.abs(r1.top - cur.top) > 6

      if (moved) {
        // the old copy shrinks away; the new one glides into its slot
        old.wrap.animate([{ transform: `${at(cur.left, cur.top)} scale(1)`, opacity: 1 }, { transform: `${at(cur.left, cur.top)} scale(0.6)`, opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' }).onfinish = () => old.wrap.remove()
        wrap.animate([{ transform: at(from.x, from.y) }, { transform: at(r1.left, r1.top) }], { duration: 440, easing: SPRING, fill: 'forwards' }).onfinish = () => finish(dest)
        clone.animate([{ transform: 'scale(1.04)', boxShadow: SHADOW, width: `${a.cw}px` }, { transform: 'scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)', width: `${r1.width}px` }], { duration: 440, easing: SPRING, fill: 'forwards' })
        return
      }

      old.wrap.remove()
      const t = target ? document.querySelector(`[data-drop="${target}"]:not([aria-hidden])`) : null
      if (t) {
        // dropped on something that tags it: the copy shrinks into the target
        const tr = t.getBoundingClientRect()
        const cx = tr.left + tr.width / 2 - a.cw / 2
        const cy = tr.top + tr.height / 2 - cur.height / 2
        wrap.animate([{ transform: at(from.x, from.y) }, { transform: at(cx, cy) }], { duration: 300, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)', fill: 'forwards' })
        clone.animate([{ transform: 'scale(1.04)', opacity: 1 }, { transform: 'scale(0.15)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)', fill: 'forwards' }).onfinish = () => finish(dest)
      } else {
        // nowhere to drop: spring back where it came from
        wrap.animate([{ transform: at(from.x, from.y) }, { transform: at(cur.left, cur.top) }], { duration: 420, easing: SPRING, fill: 'forwards' }).onfinish = () => finish(dest)
        clone.animate([{ transform: 'scale(1.04)', width: `${a.cw}px` }, { transform: 'scale(1)', width: `${cur.width}px` }], { duration: 420, easing: SPRING, fill: 'forwards' })
      }
    })
  },
}
