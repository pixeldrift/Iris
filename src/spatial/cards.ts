// Drawing a task (or a group's name) onto a small canvas, to be a texture in the 3D scene. The look follows the pond's bubbles: a soft
// gradient, a thin outline in the group's colour, a round check.

export interface CardInfo {
  title: string
  hue: number
  done: boolean
  due?: string | null
  /** 0 to 100, when it is part way. */
  progress?: number
  /** A picture, if it has one (drawn faintly behind the words). */
  image?: HTMLImageElement | null
}

export const CARD_PX = { w: 384, h: 128 }
const PAD = 8
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

export function drawCard(canvas: HTMLCanvasElement, c: CardInfo) {
  canvas.width = CARD_PX.w
  canvas.height = CARD_PX.h
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, canvas.width, canvas.height)
  const x = PAD
  const y = PAD
  const w = canvas.width - PAD * 2
  const h = canvas.height - PAD * 2
  g.save()
  g.globalAlpha = c.done ? 0.55 : 1
  g.shadowColor = hsl(c.hue, 45, 55, 0.35)
  g.shadowBlur = 10
  g.shadowOffsetY = 3
  roundRect(g, x, y, w, h, 34)
  const fill = g.createLinearGradient(x, y, x + w, y + h)
  fill.addColorStop(0, 'rgba(255,255,255,0.97)')
  fill.addColorStop(1, hsl(c.hue, 70, 91, 0.97))
  g.fillStyle = fill
  g.fill()
  g.shadowColor = 'transparent'
  g.lineWidth = 2.5
  g.strokeStyle = hsl(c.hue, 55, 72, 0.9)
  g.stroke()
  if (c.image) {
    g.save()
    roundRect(g, x, y, w, h, 34)
    g.clip()
    g.globalAlpha = 0.22
    g.drawImage(c.image, x, y, w, h)
    g.restore()
  }
  // the round check
  const cx = x + 40
  const cy = y + h / 2
  g.beginPath()
  g.arc(cx, cy, 22, 0, Math.PI * 2)
  g.fillStyle = c.done ? hsl(c.hue, 60, 60, 1) : 'rgba(255,255,255,0.9)'
  g.fill()
  g.lineWidth = 2.5
  g.strokeStyle = hsl(c.hue, 55, 62, 1)
  g.stroke()
  if (c.done) {
    g.beginPath()
    g.moveTo(cx - 9, cy + 1)
    g.lineTo(cx - 2, cy + 8)
    g.lineTo(cx + 11, cy - 8)
    g.lineWidth = 4.5
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#fff'
    g.stroke()
  }
  // the words
  const tx = cx + 38
  const maxW = x + w - 18 - tx
  g.fillStyle = c.done ? 'rgba(80,70,100,0.7)' : '#2b2438'
  g.textBaseline = 'middle'
  g.font = `600 27px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`
  const lines = wrapTitle(g, c.title || 'Untitled', maxW, c.due ? 2 : 3)
  const lh = 30
  const top = cy - ((lines.length - 1) * lh) / 2 - (c.due ? 8 : 0)
  lines.forEach((ln, i) => {
    g.fillText(ln, tx, top + i * lh)
    if (c.done) {
      const wd = g.measureText(ln).width
      g.fillRect(tx, top + i * lh, wd, 2)
    }
  })
  if (c.due) {
    g.font = `500 20px ui-rounded,'SF Pro Rounded',system-ui,sans-serif`
    const tw = g.measureText(c.due).width + 22
    const px = tx
    const py = y + h - 28
    roundRect(g, px, py - 14, tw, 28, 14)
    g.fillStyle = hsl(c.hue, 60, 86, 0.95)
    g.fill()
    g.fillStyle = hsl(c.hue, 40, 30, 1)
    g.fillText(c.due, px + 11, py + 1)
  }
  if (c.progress && c.progress > 0 && c.progress < 100 && !c.done) {
    const bx = tx
    const bw = w - (tx - x) - 18
    roundRect(g, bx, y + h - 12, bw, 6, 3)
    g.fillStyle = 'rgba(255,255,255,0.8)'
    g.fill()
    roundRect(g, bx, y + h - 12, (bw * c.progress) / 100, 6, 3)
    g.fillStyle = hsl(c.hue, 60, 62, 1)
    g.fill()
  }
  g.restore()
}

export interface HubInfo {
  name: string
  hue: number
  count: number
  depth: number
}
export const HUB_PX = { w: 384, h: 96 }

export function drawHub(canvas: HTMLCanvasElement, hub: HubInfo) {
  canvas.width = HUB_PX.w
  canvas.height = HUB_PX.h
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, canvas.width, canvas.height)
  const x = 8
  const y = 14
  const w = canvas.width - 16
  const h = canvas.height - 28
  roundRect(g, x, y, w, h, h / 2)
  const fill = g.createLinearGradient(x, y, x + w, y)
  fill.addColorStop(0, hsl(hub.hue, 55, 52, 0.96))
  fill.addColorStop(1, hsl(hub.hue, 55, 60, 0.96))
  g.fillStyle = fill
  g.shadowColor = hsl(hub.hue, 50, 45, 0.4)
  g.shadowBlur = 12
  g.fill()
  g.shadowColor = 'transparent'
  g.fillStyle = '#fff'
  g.textBaseline = 'middle'
  g.font = `italic 700 34px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`
  const label = wrapTitle(g, hub.name, w - 90, 1)[0] ?? hub.name
  g.fillText(label, x + 26, y + h / 2 + 1)
  // the count in a small round chip
  g.font = `600 22px ui-rounded,'SF Pro Rounded',system-ui,sans-serif`
  const n = String(hub.count)
  const cw = Math.max(34, g.measureText(n).width + 18)
  roundRect(g, x + w - cw - 14, y + h / 2 - 17, cw, 34, 17)
  g.fillStyle = 'rgba(255,255,255,0.9)'
  g.fill()
  g.fillStyle = hsl(hub.hue, 45, 32, 1)
  g.textAlign = 'center'
  g.fillText(n, x + w - cw / 2 - 14, y + h / 2 + 1)
  g.textAlign = 'left'
}
