import { CanvasTexture, SRGBColorSpace } from 'three'
import { flowerMarkup } from '../ui/Flower'
import { hsla as lhsla, look, LOOK } from '../core/look'
import type { DueTone } from '../core/rowModel'
import type { FlowerShape } from '../core/types'
import { DANGER_INK, ROSE_SOFT, TOKENS } from '../ui/palette'

// Drawing a task (or a group's name) onto a small canvas, to be a texture in the 3D scene. The look IS the pond bubble's (`core/look.ts`:
// the same shine, glow, outline and shadow, deeper when urgent), just not round, laid over the app's cream so a card is opaque.

export interface CardInfo {
  title: string
  hue: number
  done: boolean
  /** The date chip's words (from `dueInfo`, so it reads as it does in every view) and its tone. */
  due?: string | null
  dueTone?: DueTone
  /** 0 to 1: how urgent, which deepens the colour (as it does in the pond). */
  urgency?: number
  /** 0 to 100, when it is part way. */
  progress?: number
  /** A picture, if it has one (drawn faintly behind the words). */
  image?: HTMLImageElement | null
  imageUrl?: string | null
  tally?: { done: number; total: number } | null
}

/** The card itself, and the room around it in the texture for its soft shadow. */
const CARD_BODY = { w: 368, h: 112 }
const PAD_X = 18
const PAD_Y = 26
export const CARD_PX = { w: CARD_BODY.w + PAD_X * 2, h: CARD_BODY.h + PAD_Y * 2 }
/** How much bigger than the card the texture's plane must be, so the card keeps its world size. */
export const CARD_PLANE = { x: CARD_PX.w / CARD_BODY.w, y: CARD_PX.h / CARD_BODY.h }
/** The app's cream (--color-cream-50 / --color-cream-100), for blending the cards' gradient into the same background. */
const CREAM_LIGHT = '#fffdf9'
const CHIP: Record<DueTone, { fill: string; ink: string }> = {
  today: { fill: 'rgba(225,208,244,0.85)', ink: TOKENS['--color-lilac-700'] },
  late: { fill: ROSE_SOFT, ink: DANGER_INK },
  later: { fill: 'rgba(255,255,255,0.8)', ink: TOKENS['--color-ink-soft'] },
}
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h < 0 ? 0 : h},${h < 0 ? 0 : s}%,${l}%,${a})`

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Break a title into at most `max` lines that fit `width`, with an ellipsis if it runs on. */
export function wrapTitle(g: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const tryLine = cur ? `${cur} ${words[i]}` : words[i]
    if (g.measureText(tryLine).width <= width || !cur) cur = tryLine
    else {
      lines.push(cur)
      cur = words[i]
      if (lines.length === max - 1) {
        cur = words.slice(i).join(' ')
        break
      }
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > max) lines.length = max
  const last = lines.length - 1
  if (last >= 0) {
    let t = lines[last]
    if (g.measureText(t).width > width) {
      while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1)
      lines[last] = `${t}…`
    }
  }
  return lines
}

/** `scale` below 1 draws a smaller texture (many tasks on screen at once: kinder to memory), with the same layout. */
const taskImages = new Map<string, HTMLImageElement>()
export function cardImage(src: string | null | undefined, onLoad: () => void): HTMLImageElement | undefined {
  if (!src) return undefined
  const cached = taskImages.get(src)
  if (cached?.complete && cached.naturalWidth > 0) return cached
  if (cached) return undefined
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = onLoad
  img.src = src
  taskImages.set(src, img)
  return undefined
}

export function drawCard(canvas: HTMLCanvasElement, c: CardInfo, scale = 1) {
  canvas.width = Math.round(CARD_PX.w * scale)
  canvas.height = Math.round(CARD_PX.h * scale)
  const g = canvas.getContext('2d')!
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.setTransform(scale, 0, 0, scale, 0, 0)
  g.clearRect(0, 0, CARD_PX.w, CARD_PX.h)
  const x = PAD_X
  const y = PAD_Y
  const w = CARD_BODY.w
  const h = CARD_BODY.h
  const R = 36 // the row's corner: well rounded (the card is 112 tall, so a full pill would be 56)
  const lk = look(c.hue, c.urgency)
  g.save()
  // opaque like the pond's bubbles look over the page (only a ticked-off one goes see-through)
  g.globalAlpha = c.done ? 0.5 : 1
  g.shadowColor = lhsla(lk.h, lk.shadow.s, lk.shadow.l, lk.shadow.a)
  // the same one shadow as in CSS, at the card's scale (this texture is about 4x the size it shows at)
  g.shadowBlur = LOOK.drop.blur * 1.6
  g.shadowOffsetY = LOOK.drop.y * 1.8
  roundRect(g, x, y, w, h, R)
  g.fillStyle = CREAM_LIGHT
  g.fill()
  g.shadowColor = 'transparent'
  // the bubble's layers, bottom to top: the white base, the group's glow lower right, the shine upper left
  g.fillStyle = `rgba(255,255,255,${LOOK.baseAlpha})`
  g.fill()
  g.save()
  roundRect(g, x, y, w, h, R)
  g.clip()
  const ellipse = (at: readonly [number, number], stop: number, color: string) => {
    // CSS "ellipse at X Y" sizes itself to the farthest corner: radii are the far sides times root two
    const fx = Math.max(at[0], 1 - at[0]) * w * Math.SQRT2
    const fy = Math.max(at[1], 1 - at[1]) * h * Math.SQRT2
    g.save()
    g.translate(x + at[0] * w, y + at[1] * h)
    g.scale(fx, fy)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    gr.addColorStop(0, color)
    gr.addColorStop(stop, color.replace(/[\d.]+\)$/, '0)'))
    g.fillStyle = gr
    g.fillRect(-2, -2, 4, 4)
    g.restore()
  }
  ellipse(LOOK.glow.at, LOOK.glow.stop, lhsla(lk.h, lk.fill.s, lk.fill.l, lk.fill.a))
  ellipse(LOOK.shine.at, LOOK.shine.stop, `rgba(255,255,255,${LOOK.shine.alpha})`)
  g.restore()
  // the 1px border in the group's colour. The card is drawn about 4x the size it shows at, so the line is thinner than 1px of texture and
  // fully opaque: a hairline here is about one screen pixel at the usual zoom, and grows and shrinks with the card when it is zoomed
  roundRect(g, x, y, w, h, R)
  g.lineWidth = 2.5
  g.strokeStyle = lhsla(lk.h, lk.outline.s, lk.outline.l - 4, 1)
  g.stroke()
  if (c.image) {
    g.save()
    roundRect(g, x, y, w, h, R)
    g.clip()
    g.globalAlpha = 0.42
    g.drawImage(c.image, x, y, w, h)
    g.restore()
  }
  // the check: an inset circle (a well), filled in the group's colour when ticked
  const cx = x + 42
  const cy = y + h / 2
  const cr = 24
  g.save()
  g.beginPath()
  g.arc(cx, cy, cr, 0, Math.PI * 2)
  g.clip()
  if (c.done) {
    const f = g.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, cr)
    f.addColorStop(0, hsl(c.hue, 65, 72, 1))
    f.addColorStop(1, hsl(c.hue, 60, 56, 1))
    g.fillStyle = f
  } else g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2)
  // the inner shadow that makes it a well: a dark ring just outside the circle, blurred inward
  g.shadowColor = hsl(c.hue, 40, 30, 0.45)
  g.shadowBlur = 9
  g.shadowOffsetX = 3
  g.shadowOffsetY = 4
  g.lineWidth = 12
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  g.beginPath()
  g.arc(cx, cy, cr + 6, 0, Math.PI * 2)
  g.stroke()
  g.restore()
  g.beginPath()
  g.arc(cx, cy, cr, 0, Math.PI * 2)
  g.lineWidth = 2
  g.strokeStyle = 'rgba(255,255,255,0.85)'
  g.stroke()
  if (c.done) {
    g.beginPath()
    g.moveTo(cx - 10, cy + 1)
    g.lineTo(cx - 3, cy + 9)
    g.lineTo(cx + 12, cy - 9)
    g.lineWidth = 5
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#fff'
    g.stroke()
  }
  // the due chip, on the right (measured first, so the words never run under it)
  g.font = `600 22px ui-rounded,'SF Pro Rounded',system-ui,sans-serif`
  const chipW = c.due ? g.measureText(c.due).width + 24 : 0
  if (c.due) {
    const px = x + w - 16 - chipW
    const py = cy
    roundRect(g, px, py - 17, chipW, 34, 17)
    // the same three tones as the chip everywhere else: today, late, a later day
    const tone = CHIP[c.dueTone ?? 'later']
    g.fillStyle = tone.fill
    g.fill()
    g.fillStyle = tone.ink
    g.textBaseline = 'middle'
    g.fillText(c.due, px + 12, py + 1)
  }
  // the words (up to two lines, with an ellipsis, in the space between the check and the chip)
  const tx = cx + cr + 18
  const maxW = x + w - 18 - tx - (c.due ? chipW + 10 : 0)
  g.fillStyle = c.done ? 'rgba(80,70,100,0.7)' : TOKENS['--color-ink']
  // a little white glow around the words, as on every other item
  g.shadowColor = LOOK.textGlow.color
  g.shadowBlur = LOOK.textGlow.blur
  g.textBaseline = 'middle'
  g.font = `600 29px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`
  const lines = wrapTitle(g, c.title || 'Untitled', maxW, 2)
  const lh = 33
  const top = cy - ((lines.length - 1) * lh) / 2
  lines.forEach((ln, i) => {
    g.fillText(ln, tx, top + i * lh)
    if (c.done) g.fillRect(tx, top + i * lh, g.measureText(ln).width, 2.5)
  })
  g.shadowColor = 'transparent'
  g.shadowBlur = 0
  if (c.progress != null && c.progress < 100 && !c.done) {
    const bw = x + w - 22 - tx - (c.tally && c.tally.done < c.tally.total ? 58 : 0)
    roundRect(g, tx, y + h - 14, bw, 6, 3)
    g.fillStyle = 'rgba(255,255,255,0.8)'
    g.fill()
    roundRect(g, tx, y + h - 14, (bw * c.progress) / 100, 6, 3)
    g.fillStyle = hsl(c.hue, 60, 62, 1)
    g.fill()
  }
  if (c.tally && c.tally.done < c.tally.total && !c.done) {
    const bw = 48
    const bh = 28
    const bx = x + w - bw - 16
    const by = y + h - bh - 8
    roundRect(g, bx, by, bw, bh, 14)
    g.fillStyle = 'rgba(139,105,190,0.94)'
    g.fill()
    g.font = "700 16px ui-rounded,'SF Pro Rounded',system-ui,sans-serif"
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#fff'
    g.fillText('+1', bx + bw / 2, by + bh / 2 + 0.5)
    g.textAlign = 'start'
  }
  g.restore()
}

export interface HubInfo {
  name: string
  hue: number
  shape?: FlowerShape
  count: number
  depth: number
  /** Folded down to just its name. */
  collapsed?: boolean
}
export const HUB_PX = { w: 512, h: 96 }

/** A group's flower, drawn once from its SVG and kept (it calls back when it has loaded, so the name can be drawn again). */
const flowers = new Map<string, HTMLImageElement>()
export function flowerImage(hue: number, shape: FlowerShape | undefined, onLoad: () => void): HTMLImageElement | undefined {
  const key = `${shape ?? 'blossom'}:${hue}`
  const have = flowers.get(key)
  if (have) return have.complete && have.naturalWidth ? have : undefined
  const img = new Image()
  img.onload = onLoad
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(flowerMarkup(hue, shape ?? 'blossom', 96))}`
  flowers.set(key, img)
  return undefined
}

export function drawHub(canvas: HTMLCanvasElement, hub: HubInfo, onFlower: () => void = () => {}, hover = false) {
  canvas.width = HUB_PX.w
  canvas.height = HUB_PX.h
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, canvas.width, canvas.height)
  // the pond's group name: bold italic serif in the group's own colour, no bubble behind it, a soft white glow to keep it readable.
  // In front: a twirl (down when open, right when folded) and the group's flower; after it, the count in a small pale chip.
  const mid = canvas.height / 2
  if (hover) {
    // something is being carried over this name: a soft glow behind it says it would land here
    roundRect(g, 2, 6, canvas.width - 4, canvas.height - 12, (canvas.height - 12) / 2)
    g.fillStyle = hub.hue < 0 ? 'rgba(255,255,255,0.8)' : hsl(hub.hue, 70, 92, 0.9)
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = hub.hue < 0 ? 'rgba(180,170,200,0.9)' : hsl(hub.hue, 70, 60, 0.9)
    g.stroke()
  }
  const ink = hub.hue < 0 ? 'hsl(270,20%,38%)' : hsl(hub.hue, 50, 36, 1)
  g.fillStyle = ink
  g.beginPath()
  if (hub.collapsed) {
    g.moveTo(14, mid - 11)
    g.lineTo(14, mid + 11)
    g.lineTo(32, mid)
  } else {
    g.moveTo(10, mid - 7)
    g.lineTo(34, mid - 7)
    g.lineTo(22, mid + 12)
  }
  g.closePath()
  g.globalAlpha = 0.75
  g.fill()
  g.globalAlpha = 1
  const fl = flowerImage(hub.hue, hub.shape, onFlower)
  if (fl) g.drawImage(fl, 50, mid - 24, 48, 48)
  const x = 108
  g.textBaseline = 'middle'
  g.font = `600 22px ui-rounded,'SF Pro Rounded',system-ui,sans-serif`
  const n = String(hub.count)
  const cw = Math.max(34, g.measureText(n).width + 18)
  g.font = `italic 700 54px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`
  const label = wrapTitle(g, hub.name, canvas.width - x - cw - 30, 1)[0] ?? hub.name
  g.shadowColor = 'rgba(255,255,255,0.95)'
  g.shadowBlur = 8
  g.fillStyle = ink
  g.fillText(label, x, mid + 1)
  g.fillText(label, x, mid + 1)
  g.shadowColor = 'transparent'
  const tw = g.measureText(label).width
  const cx = x + tw + 14
  roundRect(g, cx, mid - 17, cw, 34, 17)
  g.fillStyle = hub.hue < 0 ? 'rgba(235,232,240,0.9)' : hsl(hub.hue, 60, 90, 0.95)
  g.fill()
  g.font = `600 22px ui-rounded,'SF Pro Rounded',system-ui,sans-serif`
  g.fillStyle = ink
  g.textAlign = 'center'
  g.fillText(n, cx + cw / 2, mid + 1)
  g.textAlign = 'left'
}

/**
 * The pane behind a group's cards, drawn at the pane's own proportions (48 px a unit) with large round corners, a soft tint of the
 * group's colour blended into the cream, a fine outline and a faint glow, so nothing is a hard square.
 */
export function drawPlate(wUnits: number, hUnits: number, hue: number, hover = false): CanvasTexture {
  const PX = 48
  const w = Math.max(32, Math.round(wUnits * PX))
  const h = Math.max(32, Math.round(hUnits * PX))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const pad = 6
  const radius = Math.min(2.4 * PX, (Math.min(w, h) - pad * 2) / 2)
  roundRect(g, pad, pad, w - pad * 2, h - pad * 2, radius)
  g.fillStyle = hue < 0 ? 'rgba(236,236,236,0.34)' : hsl(hue, 60, 84, hover ? 0.62 : 0.3)
  g.fill()
  g.lineWidth = hover ? 6 : 3
  g.strokeStyle = hue < 0 ? 'rgba(200,200,200,0.55)' : hsl(hue, hover ? 70 : 55, hover ? 58 : 72, hover ? 0.95 : 0.5)
  g.stroke()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
