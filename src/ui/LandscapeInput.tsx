import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconClose } from './icons'
import { useLandscapePhone } from './useMedia'

/**
 * A phone turned sideways has almost no height left once the keyboard is up, so a text box in the lower part of the
 * screen ends up under it. Instead of fighting that, tapping such a box hands the typing over to a one-line bar at the
 * top of the screen, with the box's name in front of it, which is always above the keyboard. Confirming (✓, or Return
 * on a one-line box) writes what was typed into the real box; × throws it away.
 *
 * It only steps in for boxes low enough to be covered (higher ones, in the top 30% of the screen, are left alone), and not for any marked `data-no-proxy`.
 * A box marked `data-proxy-enter` also gets a Return pressed in it after the text arrives (the tag box adds its tag that way).
 */
type Field = HTMLInputElement | HTMLTextAreaElement
const TEXTY = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''])

// the box not in use is collapsed rather than display:none, so it can still be focused in the very tap that opens the bar
const QUIET = 'pointer-events-none absolute h-px w-px opacity-0'

/** What the box is called: its own label, never its placeholder (which is only a hint). Every text field in the app is given one. */
const labelOf = (el: Field) => (el.getAttribute('data-field-label') || el.getAttribute('aria-label') || el.labels?.[0]?.textContent || '').trim()

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * What was just typed flies down from the bar to the box it belongs in, growing or shrinking to the box's width on the
 * way and settles into place (no hop, no bounce): so you can see where it went. The box is followed as it
 * moves (the keyboard leaving shifts the page), and its own text stays hidden until the flying copy has landed.
 */
function fly(el: Field, from: DOMRect, text: string, onLanded?: () => void): boolean {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const first = el.getBoundingClientRect()
  if (first.width === 0 || first.bottom < 0 || first.top > window.innerHeight) return false
  const cs = getComputedStyle(el)
  const ghost = document.createElement('div')
  ghost.className = 'well'
  Object.assign(ghost.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: 'var(--z-input-top)',
    pointerEvents: 'none',
    overflow: 'hidden',
    boxSizing: 'border-box',
    whiteSpace: el instanceof HTMLTextAreaElement ? 'pre-wrap' : 'nowrap',
    textOverflow: 'ellipsis',
    borderRadius: cs.borderRadius,
    padding: cs.padding,
    font: cs.font,
    color: 'var(--color-ink)',
    willChange: 'transform, width, height',
  })
  ghost.textContent = text
  document.body.appendChild(ghost)
  const hide = el.style.color
  el.style.color = 'transparent'
  const t0 = performance.now()
  const DURATION = 520
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / DURATION)
    // where the box is right now (the page may still be moving)
    const to = el.isConnected ? el.getBoundingClientRect() : first
    const p = EASE_OUT(t)
    const x = from.left + (to.left - from.left) * p
    const y = from.top + (to.top - from.top) * p
    ghost.style.transform = `translate(${x}px, ${y}px)`
    ghost.style.width = `${from.width + (to.width - from.width) * p}px`
    ghost.style.height = `${from.height + (to.height - from.height) * p}px`
    // lifted while it travels, set down as it lands
    ghost.style.boxShadow = `0 ${14 * (1 - p)}px ${28 * (1 - p)}px -10px rgb(var(--lr-700) / ${0.45 * (1 - p)})`
    if (t < 1) return void requestAnimationFrame(step)
    // landed: the box shows its own text (no bounce)
    el.style.color = hide
    ghost.remove()
    onLanded?.()
  }
  requestAnimationFrame(step)
  return true
}

/** Press Return in a box the way a keyboard would: key events, and if nothing took it, submit the form the box is in (a quick-add line, say). */
function pressEnter(el: Field) {
  if (!el.isConnected) return
  const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }
  const free = el.dispatchEvent(new KeyboardEvent('keydown', init))
  el.dispatchEvent(new KeyboardEvent('keyup', init))
  if (free && el instanceof HTMLInputElement && el.form) el.form.requestSubmit()
}

export function LandscapeInput() {
  const land = useLandscapePhone()
  const [shown, setShown] = useState<{ label: string; multi: boolean } | null>(null)
  const line = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const target = useRef<Field | null>(null)
  const done = useRef(false)

  const close = () => {
    target.current = null
    setShown(null)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }
  /** `commit`: Return was pressed in the bar, so once the text has landed Return is pressed in the box too, if it is one that needs it (an add line making its new item, say). */
  const apply = (el: Field | null = target.current, commit = false) => {
    const src = el instanceof HTMLTextAreaElement ? area.current : line.current
    if (!el || !src) return close()
    if (el !== target.current) return // a different box has been opened since: nothing to hand back here
    const from = src.getBoundingClientRect()
    const text = src.value
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    // React watches the value through its own setter: write it the way a keystroke would, then say it changed
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    if (el.hasAttribute('data-proxy-enter')) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    // boxes that settle their value when they lose focus (a birthday, say) are told they have
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    // (only boxes that need Return for anything to happen: an add line, not a field whose text is already kept as it is typed)
    const press = () => commit && el.hasAttribute('data-proxy-commit') && !el.hasAttribute('data-proxy-enter') && pressEnter(el)
    if (!(text && fly(el, from, text, press))) press()
    close()
  }

  const lastTap = useRef(0)
  useEffect(() => {
    // a box focused by the page itself (an autofocus) doesn't raise the keyboard, so there is nothing to get out of the way of
    const mark = () => (lastTap.current = performance.now())
    for (const t of ['pointerdown', 'touchstart', 'keydown']) document.addEventListener(t, mark, true)
    return () => {
      for (const t of ['pointerdown', 'touchstart', 'keydown']) document.removeEventListener(t, mark, true)
    }
  }, [])

  useEffect(() => {
    if (!land) return
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      if (el.closest('[data-input-proxy]') || el.closest('[data-no-proxy]') || el.readOnly || el.disabled) return
      if (performance.now() - lastTap.current > 700) return
      if (el instanceof HTMLInputElement && !TEXTY.has(el.type)) return
      // high enough to stay above the keyboard (and the strip iOS adds above it: together they cover the lower two thirds): leave it be
      if (el.getBoundingClientRect().bottom < window.innerHeight * 0.3) return
      const multi = el instanceof HTMLTextAreaElement
      const proxy = multi ? area.current : line.current
      if (!proxy) return
      target.current = el
      done.current = false
      proxy.value = el.value
      if (proxy instanceof HTMLInputElement && el instanceof HTMLInputElement) {
        proxy.type = el.type === 'number' ? 'text' : el.type
        proxy.inputMode = el.inputMode || (el.type === 'number' ? 'decimal' : '')
      }
      proxy.setAttribute('autocomplete', el.getAttribute('autocomplete') ?? 'off')
      proxy.placeholder = ''
      setShown({ label: labelOf(el), multi })
      // inside the same tap, so the keyboard stays up and is simply now typing into the bar
      proxy.focus()
      proxy.setSelectionRange(proxy.value.length, proxy.value.length)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [land])

  if (!land) return null
  const open = !!shown
  const tidy = (e: React.FocusEvent) => {
    // focus left the bar. To another box of the bar (the buttons don't take it): nothing. Otherwise keep what was typed.
    const next = e.relatedTarget as Node | null
    if (next && (e.currentTarget.parentElement?.contains(next) ?? false)) return
    const t = target.current
    if (!t || done.current) return
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) apply(t) // straight on to another box: this one's text goes in first
    else window.setTimeout(() => target.current === t && !done.current && apply(t), 0) // keyboard put away, or a tap elsewhere
  }
  const keep = (e: React.PointerEvent) => e.preventDefault() // pressing the buttons must not take focus (and the keyboard) away from the bar
  return (
    <div
      data-input-proxy
      aria-hidden={!open}
      className={`fixed inset-x-0 top-0 z-[var(--z-input)] flex justify-center transition-[opacity,transform] duration-150 ${open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}
      style={{ paddingTop: '0.4rem', paddingLeft: 'max(0.5rem, var(--safe-l))', paddingRight: 'max(0.5rem, var(--safe-r))' }}
    >
      <div className={`glass glass-strong flex w-full max-w-3xl gap-2 rounded-2xl px-3 py-1.5 ${shown?.multi ? 'items-start' : 'items-center'}`}>
        {shown?.label && <span className={`max-w-[8rem] shrink-0 truncate text-xs font-medium text-ink-soft ${shown.multi ? 'pt-2.5' : ''}`}>{shown.label}</span>}
        <input
          ref={line}
          tabIndex={open && !shown?.multi ? 0 : -1}
          aria-hidden={!open || shown?.multi}
          aria-label={shown && !shown.multi ? (shown.label ? `${shown.label}: type here` : 'Type here') : undefined}
          className={`well h-9 min-w-0 flex-1 rounded-xl px-3 text-sm ${shown?.multi ? QUIET : ''}`}
          onBlur={tidy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              done.current = true
              apply(target.current, true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              done.current = true
              close()
            }
          }}
        />
        <textarea
          ref={area}
          rows={2}
          tabIndex={open && shown?.multi ? 0 : -1}
          aria-hidden={!open || !shown?.multi}
          aria-label={shown?.multi ? (shown.label ? `${shown.label}: type here` : 'Type here') : undefined}
          className={`well min-w-0 flex-1 resize-none rounded-xl px-3 py-1.5 text-sm ${shown?.multi ? '' : QUIET}`}
          onBlur={tidy}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              done.current = true
              close()
            }
          }}
        />
        <button type="button" onPointerDown={keep} onClick={() => ((done.current = true), close())} aria-label="Cancel" title="Cancel" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-ink">
          <IconClose size={14} />
        </button>
        <button type="button" onPointerDown={keep} onClick={() => ((done.current = true), apply())} aria-label="Done" title="Done" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-500 text-white shadow shadow-lilac-500/30 transition hover:bg-lilac-600">
          <IconCheck size={15} />
        </button>
      </div>
    </div>
  )
}
