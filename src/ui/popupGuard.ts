/**
 * A tap on the background while a pop-up (a menu, a picker) is open only closes it: it must not also do what a tap on the background does
 * (make a new item). The pop-up closes on the press itself, so by the time the tap is released it is already gone; this remembers whether one
 * was open when the press began. (Registered once, first, on the window's capture phase, so it runs before the pop-up's own handler.)
 */
let openAtPress = false
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (openAtPress = !!document.querySelector('[data-popover]')), true)
}
export const popupWasOpen = () => openAtPress
