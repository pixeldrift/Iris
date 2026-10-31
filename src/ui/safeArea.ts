/**
 * How far the screen's notch / Dynamic Island / rounded corners reach in from each side right now (px). A phone turned
 * sideways has one on the left or right. CSS `env(safe-area-inset-*)` is used wherever it can be; this is for the places
 * that position things in script (menus placed against the screen edges).
 */
let probe: HTMLDivElement | null = null

export function safeInsets(): { left: number; right: number } {
  if (typeof document === 'undefined') return { left: 0, right: 0 }
  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return { left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 }
}
