/**
 * Where to scroll the pattern box so that a bubble stays in view: not at all if it already is, otherwise just far enough that its
 * row is the last (or first) one showing, so a new row of bubbles slides up from below and the first row slides out of view.
 * `top`/`height` are the bubble's place in the box's content; `view` is what is showing.
 */
export function scrollFor(scroll: number, view: number, top: number, height: number, pad = 8): number {
  if (top - pad < scroll) return Math.max(0, top - pad)
  if (top + height + pad > scroll + view) return top + height + pad - view
  return scroll
}
