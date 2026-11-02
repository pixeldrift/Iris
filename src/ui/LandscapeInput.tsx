import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconClose } from './icons'
import { useLandscapePhone } from './useMedia'

/**
 * A phone turned sideways has almost no height left once the keyboard is up, so a text box in the lower part of the
 * screen ends up under it. Instead of fighting that, tapping such a box hands the typing over to a one-line bar at the
 * top of the screen, with the box's name in front of it, which is always above the keyboard. Confirming (✓, or Return
 * on a one-line box) writes what was typed into the real box; × throws it away.
 *
 * It only steps in for boxes low enough to be covered (higher ones are left alone), and not for any marked `data-no-proxy`.
 * A box marked `data-proxy-enter` also gets a Return pressed in it after the text arrives (the tag box adds its tag that way).
 */
type Field = HTMLInputElement | HTMLTextAreaElement
const TEXTY = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''])

// the box not in use is collapsed rather than display:none, so it can still be focused in the very tap that opens the bar
const QUIET = 'pointer-events-none absolute h-px w-px opacity-0'

const labelOf = (el: Field) => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.placeholder || el.name || 'Text').trim().replace(/…$/, '')

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
  const apply = (el: Field | null = target.current) => {
    const src = el instanceof HTMLTextAreaElement ? area.current : line.current
    if (!el || !src) return close()
    if (el !== target.current) return // a different box has been opened since: nothing to hand back here
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    // React watches the value through its own setter: write it the way a keystroke would, then say it changed
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, src.value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    if (el.hasAttribute('data-proxy-enter')) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    // boxes that settle their value when they lose focus (a birthday, say) are told they have
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
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
      // high enough on the screen to stay above the keyboard: leave it be
      if (el.getBoundingClientRect().bottom < window.innerHeight * 0.45) return
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
      proxy.placeholder = el.placeholder
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
      className={`fixed inset-x-0 top-0 z-[400] flex justify-center transition-[opacity,transform] duration-150 ${open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}
      style={{ paddingTop: '0.4rem', paddingLeft: 'max(0.5rem, var(--safe-l))', paddingRight: 'max(0.5rem, var(--safe-r))' }}
    >
      <div className="glass glass-strong flex w-full max-w-3xl items-center gap-2 rounded-2xl px-3 py-1.5">
        <span className="max-w-[8rem] shrink-0 truncate text-xs font-medium text-ink-soft">{shown?.label}</span>
        <input
          ref={line}
          tabIndex={open && !shown?.multi ? 0 : -1}
          aria-hidden={!open || shown?.multi}
          aria-label={shown && !shown.multi ? `${shown.label}: type here` : undefined}
          className={`well h-9 min-w-0 flex-1 rounded-xl px-3 text-sm ${shown?.multi ? QUIET : ''}`}
          onBlur={tidy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              done.current = true
              apply()
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
          aria-label={shown?.multi ? `${shown.label}: type here` : undefined}
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
