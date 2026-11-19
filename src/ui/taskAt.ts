/**
 * Which task is under a point on the screen, whatever view it is in: a row (`data-lift-id="task:…"`), a card (`data-card-id`), a bubble
 * (`data-task-id`), a flat-canvas card (`data-task`), or (for the 3D scene, which is one canvas) whatever the scene says. Used when something is
 * dragged onto a task from outside the lists, like a tag torn off a task's details.
 */
type Resolver = (x: number, y: number) => string | null
let sceneResolver: Resolver | null = null
/** The 3D scene says which task a screen point is over (and gives a place for the confirmation to appear). */
export const registerSceneTaskAt = (fn: Resolver | null) => {
  sceneResolver = fn
}
let sceneAnchor: ((id: string) => { x: number; y: number } | null) | null = null
export const registerSceneAnchor = (fn: ((id: string) => { x: number; y: number } | null) | null) => {
  sceneAnchor = fn
}

const SELECTOR = '[data-lift-id^="task:"], [data-card-id], [data-task-id], [data-task]'
function idOf(el: Element): string | null {
  const h = el as HTMLElement
  const raw = h.dataset.liftId?.startsWith('task:') ? h.dataset.liftId.slice(5) : (h.dataset.cardId ?? h.dataset.taskId ?? h.dataset.task ?? null)
  // (a card on the canvas is one place of an item that may show in several groups: `id@group`)
  return raw ? raw.split('@')[0] : null
}

export function taskElementAt(x: number, y: number): { id: string; el: HTMLElement | null } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    // (the details panel and the dialogs on top are not a place to drop a tag)
    if ((el as HTMLElement).closest?.('[role="dialog"], [data-popover]')) return null
    const t = (el as HTMLElement).closest?.(SELECTOR) as HTMLElement | null
    const id = t && idOf(t)
    if (t && id) return { id, el: t }
  }
  const id = sceneResolver?.(x, y)
  return id ? { id, el: null } : null
}

/** Where on the screen a task is (its element's top right, or the 3D scene's idea of it). */
export function taskAnchor(id: string, el: HTMLElement | null): { x: number; y: number } | null {
  const e = el ?? document.querySelector<HTMLElement>(ELS(id))
  if (e) {
    const r = e.getBoundingClientRect()
    return { x: r.right - 8, y: r.top }
  }
  return sceneAnchor?.(id) ?? null
}

/** The 3D scene pulses a card (it has no element to ring). */
let scenePulse: ((id: string) => void) | null = null
export const registerScenePulse = (fn: ((id: string) => void) | null) => {
  scenePulse = fn
}
const ELS = (id: string) => `[data-lift-id="task:${CSS.escape(id)}"], [data-card-id="${CSS.escape(id)}"], [data-task-id="${CSS.escape(id)}"], [data-task="${CSS.escape(id)}"], [data-task^="${CSS.escape(id)}@"]`

/** Ring a task wherever it is on the screen (every place it shows, in the colour of the group), once. Returns the first element it found. */
export function pulseTask(id: string, hue: number): HTMLElement | null {
  const els = [...document.querySelectorAll<HTMLElement>(ELS(id))]
  for (const el of els) {
    el.style.setProperty('--tag-h', String(hue < 0 ? 0 : hue))
    el.classList.remove('tag-landed')
    void el.offsetWidth
    el.classList.add('tag-landed')
    window.setTimeout(() => el.classList.remove('tag-landed'), 1100)
  }
  scenePulse?.(id)
  return els[0] ?? null
}

/** The look of a target being hovered by a torn-off tag, and of a tag having landed on it (a ring that pulses once, and a small "+ Group" that rises). */
export function markTarget(el: HTMLElement | null, prev: HTMLElement | null, hue: number): HTMLElement | null {
  if (el === prev) return el
  prev?.classList.remove('tag-over')
  if (el) {
    el.style.setProperty('--tag-h', String(hue < 0 ? 0 : hue))
    el.classList.add('tag-over')
  }
  return el
}
export function confirmTag(id: string, el: HTMLElement | null, label: string, hue: number) {
  const target = el ?? document.querySelector<HTMLElement>(ELS(id))
  if (target) {
    target.style.setProperty('--tag-h', String(hue < 0 ? 0 : hue))
    target.classList.remove('tag-landed')
    void target.offsetWidth
    target.classList.add('tag-landed')
    window.setTimeout(() => target.classList.remove('tag-landed'), 1100)
  }
  const at = taskAnchor(id, target)
  if (!at) return
  const badge = document.createElement('div')
  badge.className = 'tag-badge'
  badge.textContent = `+ ${label}`
  badge.style.left = `${at.x}px`
  badge.style.top = `${at.y}px`
  badge.style.setProperty('--tag-h', String(hue < 0 ? 0 : hue))
  document.body.appendChild(badge)
  window.setTimeout(() => badge.remove(), 1400)
}
