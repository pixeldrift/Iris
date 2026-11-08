import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ZoomControl } from '../ZoomControl'
import { SegmentedToggle } from '../SegmentedToggle'
import { IconGame, IconPop, IconTrash } from '../icons'
import { tint } from '../../core/color'
import { plink } from '../../audio/engine'
import { boundsOf, FIELD_PAD, fitView, stepSim, WATER_FEEL } from '../../core/flock'
import { groupTasks, layoutClusters, pairKey, packCircles, relations } from '../../core/groups'
import { bubbleRadius, effectiveUrgency } from '../../core/tasks'
import type { Task, TaskKind } from '../../core/types'
import { useStore } from '../../state/store'
import { openCompose, type ComposePreset } from '../NewTask'
import { Tip } from '../Tip'
import { useSearchMatcher, useVisibleTasks } from '../useVisible'
import { WATER } from '../water'
import { WaterRipples, type WaterHandle } from '../WaterRipples'
import { Strays, type StrayField } from '../pond/Strays'
import { PlayTimer, PopGameBar } from '../pond/PopGameBar'
import { usePlayLimit } from '../pond/usePlayLimit'
import { bubbleHue } from '../pond/hue'
import { edgeDots } from '../../core/edges'
import { usePopGame } from '../pond/usePopGame'
import { paletteOf } from '../../core/popgame'
import { Lily } from '../pond/Lily'
import { Flower } from '../Flower'
import { canReparent, pathOf } from '../../core/folders'
import { undo } from '../../state/history'
import { PondMembers } from '../pond/Members'
import { askName } from '../NameDialog'
import { IconPerson } from '../icons'
import { usePondGestures } from '../pond/usePondGestures'
import { useSize } from '../pond/useSize'
import { MAX_SCALE, MIN_SCALE, type PondApi, type PopMode, type Rec, type View } from '../pond/types'
import { usePhone } from '../useMedia'

export function Pond() {
  const phone = usePhone()
  const visible = useVisibleTasks(false, 'keep') // a search fades the others here instead of removing them
  const matcher = useSearchMatcher()
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const scale = useStore((s) => s.settings.sizeByPriority)
  const group = useStore((s) => s.settings.pondGroup)
  /** The + beside a cluster's name: a new item that already belongs to it (where that means something). */
  const addHere = (key: string): ComposePreset | null =>
    key === 'none' || key === 'all' ? null : group === 'folder' ? { folderIds: [key] } : group === 'person' ? { personIds: [key] } : group === 'kind' ? { kind: key as TaskKind } : null
  const addFolder = useStore((s) => s.addFolder)
  const moveFolder = useStore((s) => s.moveFolder)
  const showToast = useStore((s) => s.showToast)
  /** Show just this group; if it is already the one shown, step back up a level (to its parent, or everything). */
  const stepTo = (id: string) => {
    const cur = scopeRef.current
    if (cur.type === 'folder' && cur.id === id) {
      const up1 = folders.find((f) => f.id === id)?.parentId
      setScope(up1 && folders.some((f) => f.id === up1) ? { type: 'folder', id: up1 } : { type: 'all' })
    } else setScope({ type: 'folder', id })
  }
  const newSubgroup = async (parentId: string) => {
    const name = await askName('New subgroup', 'Group name')
    if (name) addFolder(name, parentId)
  }
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const select = useStore((s) => s.select)

  const ref = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(ref)
  const dims = useRef({ w: 0, h: 0 })
  dims.current = { w, h }
  const view = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const nodes = useRef(new Map<string, Rec>())
  // DOM elements register themselves before their sim node exists, so they live apart
  const els = useRef(new Map<string, { outer: HTMLElement; jig: HTMLElement }>())
  const raf = useRef(0)
  const running = useRef(false)
  const grabbed = useRef(0)
  const [offscreen, setOffscreen] = useState(false)
  // a soft dot on the border for each bubble wholly out of view: which exist is state (so they fade in and out), where they sit is written
  // straight to the page as the canvas moves
  const [dots, setDots] = useState<{ id: string; hue: number; leaving?: boolean }[]>([])
  const dotsRef = useRef<{ id: string; hue: number; leaving?: boolean }[]>([])
  const dotEls = useRef(new Map<string, HTMLElement>())
  const dotAt = useRef(new Map<string, { x: number; y: number; to: { x: number; y: number }; d: number }>())
  const hueById = useRef(new Map<string, number>())
  const [labels, setLabels] = useState<{ key: string; label: string; x: number; y: number; hue?: number; path?: { id: string; name: string }[] }[]>([])
  const labelsRef = useRef(labels)

  /* cluster physics (grouped modes) */
  interface Cluster {
    key: string
    cx: number
    cy: number
    R: number
    ids: string[]
    base: Map<string, { x: number; y: number }>
  }
  const clusters = useRef(new Map<string, Cluster>())
  const shifts = useRef(new Map<string, { dx: number; dy: number }>())
  const groupOf = useRef(new Map<string, string>())
  const labelEls = useRef(new Map<string, HTMLElement>())
  // group names ride the same springs as the bubbles instead of snapping
  const labelSt = useRef(new Map<string, { x: number; y: number; vx: number; vy: number; pinned: boolean }>())
  const dragRef = useRef<{ id: string; key: string | null; home0: { x: number; y: number }; shift0: { dx: number; dy: number }; t: number; t0: number; x: number; y: number; v: number; slow: number; fast: number; broken: boolean; joined: boolean } | null>(null)
  const [hot, setHot] = useState<string | null>(null)

  /** The group's title is a handle: dragging it carries the whole cluster. */
  const dragLabel = (e: React.PointerEvent, key: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const c = clusters.current.get(key)
    if (!c) return
    const sx = e.clientX
    const sy = e.clientY
    const sh0 = shifts.current.get(key) ?? { dx: 0, dy: 0 }
    document.body.classList.add('dragging')
    grabbed.current += 1
    const st0 = labelSt.current.get(key) ?? { x: sh0.dx, y: sh0.dy, vx: 0, vy: 0, pinned: false }
    st0.pinned = true
    labelSt.current.set(key, st0)
    // Carrying a group by its name onto another group nests it there (when the pond is gathered by group).
    const nestable = group === 'folder' && key !== 'none' && folders.some((f) => f.id === key)
    const targetAt = (px: number, py: number): string | null => {
      if (!nestable) return null
      const box = ref.current?.getBoundingClientRect()
      if (!box) return null
      const cv = view.current
      const wx = (px - box.left - cv.tx) / cv.scale
      const wy = (py - box.top - cv.ty) / cv.scale
      let best: { key: string; d: number } | null = null
      for (const o of clusters.current.values()) {
        if (o.key === key || o.key === 'none' || !canReparent(folders, key, o.key)) continue
        if (folders.find((f) => f.id === key)?.parentId === o.key) continue // (already in it)
        // over one of the group's own bubbles (or the water between them: the fitted shape), or on its name
        let d = Infinity
        for (const id of o.ids) {
          const n = nodes.current.get(id)
          if (n) d = Math.min(d, Math.hypot(n.sim.x - wx, n.sim.y - wy) - n.sim.r)
        }
        d = d < FIELD_PAD ? -1 : Infinity
        const lab = labelsRef.current.find((l) => l.key === o.key)
        const r = labelEls.current.get(o.key)?.firstElementChild?.getBoundingClientRect()
        if (lab && r && px > r.left - 6 && px < r.right + 6 && py > r.top - 6 && py < r.bottom + 6) d = -2
        if (d < 0 && (!best || d < best.d)) best = { key: o.key, d }
      }
      return best?.key ?? null
    }
    let target: string | null = null
    // a tap on a group's name filters the pond to that group; tapping it again (when it is the one shown) steps back up a level
    const tapName = () => stepTo(key)
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) moved0 = true
      const k = view.current.scale
      const sh = { dx: sh0.dx + (ev.clientX - sx) / k, dy: sh0.dy + (ev.clientY - sy) / k }
      shifts.current.set(key, sh)
      const t = targetAt(ev.clientX, ev.clientY)
      if (t !== target) {
        target = t
        setHot(t)
      }
      for (const id of c.ids) {
        const m = nodes.current.get(id)
        const b = c.base.get(id)
        if (m && b) {
          m.sim.hx = b.x + sh.dx
          m.sim.hy = b.y + sh.dy
        }
      }
      wake()
    }
    let moved0 = false
    const up = () => {
      st0.pinned = false
      if (!target && !moved0 && group === 'folder' && folders.some((f) => f.id === key)) tapName()
      if (target) {
        // dropped on another group: it becomes a group inside it
        const into = folders.find((f) => f.id === target)
        const moved = folders.find((f) => f.id === key)
        shifts.current.delete(key)
        moveFolder(key, target)
        if (moved && into) showToast(`“${moved.name}” is now inside “${into.name}”`, { label: 'Undo', run: undo })
        setHot(null)
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.classList.remove('dragging')
      grabbed.current = Math.max(0, grabbed.current - 1)
      wake()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const hotRef = useRef<string | null>(null)

  const rf = Math.min(1, Math.max(0.72, w / 900))
  const radius = useCallback((t: Task) => Math.round(bubbleRadius(t, scale) * rf), [scale, rf])
  const rel = useMemo(() => relations(visible), [visible])

  // pop mode: `fun` pops bubbles that come back (the words and marks fade away), `delete` really deletes them, `game` is Simon
  const [popMode, setPopMode] = useState<PopMode>('off')
  const pop = popMode !== 'off'
  const popRef = useRef<PopMode>('off')
  popRef.current = popMode
  const playful = popMode === 'fun' || popMode === 'game'
  const addPopStats = useStore((st) => st.addPopStats)
  const hues = useMemo(() => visible.map((t) => bubbleHue(t, folders)), [visible, folders])
  hueById.current = new Map(visible.map((t, i) => [t.id, hues[i]]))
  const palette = useMemo(() => paletteOf(hues), [hues])
  // the game's colours: the commonest among the bubbles, topped up so there are always at least four to play with
  const gamePalette = useMemo(() => {
    const out = [...palette]
    for (const h of [285, 200, 150, 40, 340, 10]) if (out.length < 4 && !out.includes(h)) out.push(h)
    return out
  }, [palette])
  const field = useRef<StrayField>(null)
  const game = usePopGame(gamePalette.length, {
    counts: () => field.current?.counts(gamePalette) ?? gamePalette.map(() => 0),
    add: (cs) => field.current?.add(cs.map((c) => gamePalette[c])),
  })
  // play is kept to three minutes at a time (deleting never is): a countdown in fun mode, a game played out, then a kind word and a break
  const limit = usePlayLimit({ mode: popMode, gamePhase: game.g.phase, onStop: () => setPopMode('off') })
  // when time is up the water is cleared of bubbles (the plain ones shrink away, the real ones stay put away) while the message is up
  const resting = !!limit.note && popMode === 'off'
  const hidden = playful || resting
  // for fun: the whole field popped
  const [cleared, setCleared] = useState(false)
  // the edges of the pond that buttons and panels sit over: bubbles are framed and spawned inside what is left
  const freeInset = useRef({ t: 52, r: 8, b: 52, l: 8 })
  const [funReturn, setFunReturn] = useState(false)
  const wasPlayful = useRef(false)
  useEffect(() => {
    if (wasPlayful.current && !hidden) {
      setFunReturn(true)
      const t = window.setTimeout(() => setFunReturn(false), 900)
      return () => window.clearTimeout(t)
    }
    wasPlayful.current = hidden
  }, [hidden])
  useEffect(() => {
    if (popMode !== 'game') game.stop()
  }, [popMode]) // eslint-disable-line react-hooks/exhaustive-deps
  // time spent popping (fun and the game), banked every few seconds and when it stops
  useEffect(() => {
    if (!playful) return
    let since = Date.now()
    const bank = () => {
      const now = Date.now()
      addPopStats({ ms: now - since })
      since = now
    }
    const iv = window.setInterval(bank, 10_000)
    return () => {
      window.clearInterval(iv)
      bank()
    }
  }, [playful, addPopStats])
  const rippleRef = useRef<(id: string) => void>(() => {})
  const gameRef = useRef(game)
  gameRef.current = game
  const live = useRef({ rel, group })
  live.current = { rel, group }
  const FOLLOW_DELAY = 160 // ms the cluster waits before following, so a quick yank is spotted first
  const JOIN_SPEED = 0.55 // px/ms: a loose bubble bumping into another cluster this fast becomes part of it
  const BREAK_SPEED = 1.1 // px/ms (~1100px/s), sustained: faster than this snaps a bubble free of its cluster

  /* ---------- view transform ---------- */
  const checkOffscreen = useCallback(() => {
    const { w: W, h: H } = dims.current
    const v = view.current
    let off = false
    for (const n of nodes.current.values()) {
      const sx = n.sim.x * v.scale + v.tx
      const sy = n.sim.y * v.scale + v.ty
      if (sx < -n.sim.r * v.scale * 0.5 || sy < -n.sim.r * v.scale * 0.5 || sx > W + n.sim.r * v.scale * 0.5 || sy > H + n.sim.r * v.scale * 0.5) {
        off = true
        break
      }
    }
    setOffscreen((p) => (p === off ? p : off))
    // a soft dot on the frame for each bubble wholly out of view, along the line from the middle to it
    const next = edgeDots([...nodes.current.values()].map((n) => ({ id: n.sim.id, x: n.sim.x, y: n.sim.y, r: n.sim.r, hue: hueById.current.get(n.sim.id) ?? 285 })), v, W, H)
    const now = new Set(next.map((d) => d.id))
    for (const d of next) {
      dotAt.current.set(d.id, { x: d.x, y: d.y, to: d.at, d: d.distance })
      const el = dotEls.current.get(d.id)
      if (el) {
        el.style.left = `${d.x}px`
        el.style.top = `${d.y}px`
      }
    }
    const prev = dotsRef.current
    const stay = prev.filter((p) => now.has(p.id) || p.leaving)
    const added = next.filter((d) => !prev.some((p) => p.id === d.id && !p.leaving)).map((d) => ({ id: d.id, hue: d.hue }))
    const gone = prev.filter((p) => !now.has(p.id) && !p.leaving).map((p) => p.id)
    if (added.length || gone.length) {
      const list = [...stay.filter((p) => !added.some((a) => a.id === p.id)).map((p) => (gone.includes(p.id) ? { ...p, leaving: true } : { ...p, leaving: now.has(p.id) ? undefined : p.leaving })), ...added]
      dotsRef.current = list
      setDots(list)
      if (gone.length) {
        window.setTimeout(() => {
          dotsRef.current = dotsRef.current.filter((p) => !(p.leaving && gone.includes(p.id) && !now.has(p.id)))
          setDots(dotsRef.current)
          for (const id of gone) dotAt.current.delete(id)
        }, 450)
      }
    }
  }, [])

  const applyView = useCallback(
    (animate = false) => {
      const el = worldRef.current
      if (!el) return
      const v = view.current
      el.style.transition = animate ? 'transform 1.4s cubic-bezier(.3,.7,.2,1)' : 'none'
      el.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
      if (animate) window.setTimeout(() => (el.style.transition = 'none'), 1450)
      checkOffscreen()
    },
    [checkOffscreen],
  )

  const zoomAbout = useCallback(
    (factor: number, px: number, py: number) => {
      const v = view.current
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const k = s / v.scale
      view.current = { scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }
      applyView()
    },
    [applyView],
  )

  const frameAll = useCallback(
    (fromHomes = false, inset?: { t?: number; r?: number; b?: number; l?: number }) => {
      const list = [...nodes.current.values()].map((n) => ({ x: fromHomes ? n.sim.hx : n.sim.x, y: fromHomes ? n.sim.hy : n.sim.y, r: n.sim.r }))
      // group titles count too, so none is framed out of view
      for (const l of labelsRef.current) list.push({ x: l.x, y: l.y, r: 30 })
      const b = boundsOf(list)
      const { w: W, h: H } = dims.current
      view.current = b ? fitView(b, W, H, 18, inset) : { scale: 1, tx: 0, ty: 0 }
      applyView(true)
    },
    [applyView],
  )

  // starting the game frames all the bubbles, clear of the score box, the pattern and the buttons
  const lastPhase = useRef<string>('idle')
  useEffect(() => {
    const ph = game.g.phase
    const bar = () => ref.current?.querySelector('[data-game-bar]')?.getBoundingClientRect()
    const pondTop = () => ref.current?.getBoundingClientRect().top ?? 0
    if (popMode !== 'game') {
      freeInset.current = { t: 52, r: 8, b: 52, l: 8 }
      lastPhase.current = 'idle'
      return
    }
    const starting = (lastPhase.current === 'idle' || lastPhase.current === 'over') && ph === 'show'
    lastPhase.current = ph
    const r = bar()
    if (!r) return
    const top = r.bottom - pondTop() + 10
    // (and again if a longer pattern has grown the box down over the bubbles)
    if (starting || top > freeInset.current.t) {
      freeInset.current = { t: top, r: 10, b: 56, l: 10 }
      frameAll(false, freeInset.current)
    }
  }, [game.g.phase, game.g.round, popMode, frameAll])

  /* ---------- simulation ---------- */
  const paint = useCallback(() => {
    for (const n of nodes.current.values()) {
      const e = els.current.get(n.sim.id)
      if (e) e.outer.style.transform = `translate(${n.sim.x - n.sim.r}px, ${n.sim.y - n.sim.r}px)`
    }
  }, [])

  const wake = useCallback(() => {
    if (running.current) return
    running.current = true
    const tick = () => {
      const { rel: r, group: g } = live.current
      const list = [...nodes.current.values()].map((n) => n.sim)
      const { bumps, energy } = stepSim(
        list,
        { home: g === 'free' ? WATER_FEEL.homeFree : WATER_FEEL.homeGrouped, magnet: g === 'free' ? WATER_FEEL.magnet : WATER_FEEL.magnet * 0.5, damping: g === 'free' ? WATER_FEEL.dampingFree : WATER_FEEL.damping, push: WATER_FEEL.push },
        (a, b) => r.related.has(pairKey(a, b)),
        1,
        // gathered: each group has a field around it that other groups' bubbles cannot enter
        g === 'free' ? [] : [...clusters.current.values()].map((c) => ({ ids: new Set(c.ids), pad: FIELD_PAD })),
      )
      paint()
      let labelEnergy = 0
      for (const [key, el] of labelEls.current) {
        const t = shifts.current.get(key) ?? { dx: 0, dy: 0 }
        let st = labelSt.current.get(key)
        if (!st) labelSt.current.set(key, (st = { x: t.dx, y: t.dy, vx: 0, vy: 0, pinned: false }))
        if (st.pinned) {
          st.x = t.dx
          st.y = t.dy
          st.vx = st.vy = 0
        } else {
          st.vx = (st.vx + (t.dx - st.x) * WATER_FEEL.homeGrouped) * WATER_FEEL.damping
          st.vy = (st.vy + (t.dy - st.y) * WATER_FEEL.homeGrouped) * WATER_FEEL.damping
          st.x += st.vx
          st.y += st.vy
        }
        el.style.transform = `translate(${st.x}px, ${st.y}px)`
        labelEnergy += st.vx * st.vx + st.vy * st.vy
      }
      const now = performance.now()
      for (const bump of bumps) {
        const n = nodes.current.get(bump.id)
        const jig = els.current.get(bump.id)?.jig
        if (n && jig && bump.strength > 1.5 && now - n.bumped > 700) {
          n.bumped = now
          jig.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.035, 0.97)' }, { transform: 'scale(0.99, 1.01)' }, { transform: 'scale(1)' }],
            { duration: 700, easing: 'ease-out' },
          )
        }
      }
      if (nodes.current.size && (energy + labelEnergy > 0.02 || grabbed.current > 0)) raf.current = requestAnimationFrame(tick)
      else {
        running.current = false
        checkOffscreen()
      }
    }
    raf.current = requestAnimationFrame(tick)
  }, [paint, checkOffscreen])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /* sync sim nodes with tasks, homes and radii */
  const prevGroup = useRef(group)
  useEffect(() => {
    if (!w || !h) return
    const homes = new Map<string, { x: number; y: number }>()
    const nextLabels: typeof labels = []
    if (prevGroup.current !== group) shifts.current.clear()
    clusters.current = new Map()
    groupOf.current = new Map()
    if (group === 'free') {
      for (const t of visible) homes.set(t.id, { x: t.x * w, y: t.y * h })
    } else {
      let groups = groupTasks(visible, group, folders, people, undefined, scopeRef.current.type === 'folder' ? scopeRef.current.id : undefined)
      if (group === 'folder') {
        // the groups on this level are named in the pond even when nothing is in them yet (so there is somewhere to drop a bubble, and to add to)
        const scopeId = scopeRef.current.type === 'folder' ? scopeRef.current.id : null
        const have = new Set(groups.map((g) => g.key))
        const empties = folders
          .filter((f) => f.parentId === scopeId && !have.has(f.id))
          .map((f) => ({ key: f.id, label: f.name, taskIds: [] as string[], hue: f.hue, path: pathOf(folders, f.id).map((x) => ({ id: x.id, name: x.name })) }))
        const at = (key: string) => folders.find((f) => f.id === key)?.sort ?? 99
        if (empties.length) groups = [...groups, ...empties].sort((a, b) => at(a.key) - at(b.key))
      }
      const avgR = visible.length ? visible.reduce((s, t) => s + radius(t), 0) / visible.length : 50
      // each group's bubbles are packed snugly by their real sizes (so no odd gaps); clusters sit far enough apart never to touch
      const rOf = new Map(visible.map((t) => [t.id, radius(t)]))
      const packs = groups.map((g) => packCircles(g.taskIds.map((id) => rOf.get(id) ?? avgR)))
      const blob = (gi: number) => (groups[gi].taskIds.length ? packs[gi].R + 6 : avgR)
      const centers = layoutClusters(groups.map((_, gi) => blob(gi)), w / h, 30)
      groups.forEach((g, gi) => {
        const cx = w / 2 + centers[gi].x
        const cy = h / 2 + centers[gi].y
        const base = new Map<string, { x: number; y: number }>()
        g.taskIds.forEach((id, i) => {
          const pos = { x: cx + packs[gi].pos[i].x, y: cy + packs[gi].pos[i].y }
          homes.set(id, pos)
          base.set(id, pos)
          groupOf.current.set(id, g.key)
        })
        clusters.current.set(g.key, { key: g.key, cx, cy, R: blob(gi), ids: g.taskIds, base })
        // hug the cluster: centred over its bubbles, just above the topmost one
        let top = Infinity
        let sumX = 0
        for (const [id, pos] of base) {
          top = Math.min(top, pos.y - (rOf.get(id) ?? avgR))
          sumX += pos.x
        }
        nextLabels.push({ key: g.key, label: g.label, hue: g.hue, path: g.path, x: base.size ? sumX / base.size : cx, y: base.size ? top - 46 : cy })
      })
    }
    setLabels(nextLabels)
    labelsRef.current = nextLabels

    const map = nodes.current
    const ids = new Set(visible.map((t) => t.id))
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id)
    for (const t of visible) {
      const base = homes.get(t.id)!
      const sh = shifts.current.get(groupOf.current.get(t.id) ?? '')
      const home = sh ? { x: base.x + sh.dx, y: base.y + sh.dy } : base
      const r = radius(t)
      const rec = map.get(t.id)
      if (rec) {
        rec.sim.hx = home.x
        rec.sim.hy = home.y
        rec.sim.r = r
      } else {
        map.set(t.id, { sim: { id: t.id, x: home.x, y: home.y, vx: 0, vy: 0, hx: home.x, hy: home.y, r, pinned: false }, bumped: 0 })
      }
    }
    paint()
    wake()
    if (prevGroup.current !== group) {
      prevGroup.current = group
      window.setTimeout(() => frameAll(true), 60)
    }
  }, [visible, group, w, h, radius, folders, people, paint, wake, frameAll])

  const api: PondApi = useMemo(
    () => ({
      container: ref,
      view,
      dims,
      register: (id, outer, jig) => {
        if (outer && jig) els.current.set(id, { outer, jig })
        else els.current.delete(id)
      },
      getFrac: (id) => {
        const n = nodes.current.get(id)
        return n ? { x: n.sim.x / dims.current.w, y: n.sim.y / dims.current.h } : { x: 0.5, y: 0.5 }
      },
      isFree: () => live.current.group === 'free',
      popMode: () => popRef.current,
      ripple: (id) => rippleRef.current(id),
      grab: (id) => {
        const n = nodes.current.get(id)
        if (n) n.sim.pinned = true
        grabbed.current += 1
        const key = groupOf.current.get(id)
        const c = key ? clusters.current.get(key) : undefined
        const base = c?.base.get(id)
        if (n && key && c && base) {
          const sh = shifts.current.get(key) ?? { dx: 0, dy: 0 }
          dragRef.current = { id, key, home0: { x: n.sim.x, y: n.sim.y }, shift0: sh, t: 0, t0: 0, x: n.sim.x, y: n.sim.y, v: 0, slow: 0, fast: 0, broken: false, joined: false }
        } else dragRef.current = null
        wake()
      },
      drag: (id, fx, fy) => {
        const n = nodes.current.get(id)
        if (!n) return
        const px = fx * dims.current.w
        const py = fy * dims.current.h
        n.sim.x = px
        n.sim.y = py
        const d = dragRef.current
        if (!d || d.id !== id || !d.key) return
        const now = performance.now()
        if (d.t === 0) {
          // first sample: the pointer has only just crossed the drag threshold, so there is no speed yet
          d.t = now
          d.t0 = now
        } else {
          // floor dt: two events in the same millisecond must not read as a flick
          const speed = (Math.hypot(px - d.x, py - d.y) / Math.max(10, now - d.t)) * view.current.scale
          d.v = 0.5 * d.v + 0.5 * speed
          // a hard flick, or a sudden jump well above how fast we've been dragging (after a settling moment)
          const yank = now - d.t0 > 300 && d.v > 0.55 && d.v > 1.9 * d.slow + 0.2
          d.fast = d.v > BREAK_SPEED || yank ? d.fast + 1 : 0
          d.slow = 0.92 * d.slow + 0.08 * d.v
          d.t = now
        }
        d.x = px
        d.y = py

        /** The cluster lets go: anything it had started to follow is undone and it springs back to where it was. */
        const letGo = () => {
          const own = d.key ? clusters.current.get(d.key) : undefined
          if (!own) return
          shifts.current.set(own.key, d.shift0)
          for (const mid of own.ids) {
            const m = nodes.current.get(mid)
            const b = own.base.get(mid)
            if (m && b && mid !== id) {
              m.sim.hx = b.x + d.shift0.dx
              m.sim.hy = b.y + d.shift0.dy
            }
          }
        }
        const wobble = (who: string) =>
          els.current.get(who)?.jig.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14, 0.9)' }, { transform: 'scale(0.96, 1.05)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' })

        if (!d.broken && d.fast >= 2) {
          // surface tension snaps (a hard flick, or a sudden yank after a slower drag): the bubble is on its own now
          d.broken = true
          plink()
          letGo()
          wobble(id)
        }

        // the reverse: bumping fast into another cluster's bubbles pulls this one into that cluster
        if (!d.joined && d.v > JOIN_SPEED && live.current.group !== 'free') {
          for (const [mid, m] of nodes.current) {
            if (mid === id) continue
            const k = groupOf.current.get(mid)
            if (!k || k === d.key) continue
            if (Math.hypot(m.sim.x - px, m.sim.y - py) < n.sim.r + m.sim.r + 4) {
              d.joined = true
              if (!d.broken) {
                d.broken = true
                letGo()
              }
              plink()
              wobble(id)
              wobble(mid)
              useStore.getState().assignToGroup(id, live.current.group, k)
              hotRef.current = k
              setHot(k)
              window.setTimeout(() => {
                if (hotRef.current === k) {
                  hotRef.current = null
                  setHot(null)
                }
              }, 700)
              break
            }
          }
        }
        const c = clusters.current.get(d.key)
        if (!d.broken && !d.joined && c && now - d.t0 > FOLLOW_DELAY) {
          // slow drag: the whole cluster follows on its rubber band (members spring towards their shifted homes)
          const sh = { dx: d.shift0.dx + (px - d.home0.x), dy: d.shift0.dy + (py - d.home0.y) }
          shifts.current.set(d.key, sh)
          for (const mid of c.ids) {
            const m = nodes.current.get(mid)
            const b = c.base.get(mid)
            if (m && b) {
              m.sim.hx = b.x + sh.dx
              m.sim.hy = b.y + sh.dy
            }
          }
        } else if (d.broken) {
          // carrying a loose bubble: light up the cluster it would join
          let best: string | null = null
          let bestD = Infinity
          for (const k of clusters.current.values()) {
            const sh = shifts.current.get(k.key)
            const dist = Math.hypot(px - (k.cx + (sh?.dx ?? 0)), py - (k.cy + (sh?.dy ?? 0)))
            if (k.key !== d.key && dist < k.R * 1.25 + n.sim.r && dist < bestD) {
              best = k.key
              bestD = dist
            }
          }
          if (hotRef.current !== best) {
            hotRef.current = best
            setHot(best)
          }
        }
        wake()
      },
      release: (id, committed) => {
        const n = nodes.current.get(id)
        const d = dragRef.current
        dragRef.current = null
        if (n) n.sim.pinned = false
        grabbed.current = Math.max(0, grabbed.current - 1)
        const target = hotRef.current
        hotRef.current = null
        setHot(null)
        if (d?.broken && committed && target && live.current.group !== 'free') {
          useStore.getState().assignToGroup(id, live.current.group, target)
        }
        wake()
      },
    }),
    [wake],
  )

  /* ---------- pan / pinch / tap-to-add ---------- */
  const water = useRef<WaterHandle>(null)

  /** Each bubble lifts as the wave front reaches it (same speed as the shader's), more gently the farther it is. */
  const wave = useCallback((sx: number, sy: number, edge: number, strength: number) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const v = view.current
    /** One bubble floating over the ripple: it rises on the crest as the wave reaches it, then settles back (gentler the farther it is). */
    const lift = (el: Element, d: number, composite: CompositeOperation = 'add') => {
      const amp = (strength * Math.exp(-d / 340)) / (1 + d / 170)
      if (amp < 0.05) return
      el.animate(
        [
          { transform: 'translateY(0px) scale(1)' },
          { transform: `translateY(${-9 * amp}px) scale(${1 + 0.045 * amp})` },
          { transform: `translateY(${3 * amp}px) scale(${1 - 0.01 * amp})` },
          { transform: 'translateY(0px) scale(1)' },
        ],
        { duration: 2400, delay: (d / WATER.speed) * 1000, easing: 'ease-in-out', composite },
      )
    }
    for (const [id, n] of nodes.current) {
      const e = els.current.get(id)
      if (!e) continue
      lift(e.jig, Math.max(0, Math.hypot(n.sim.x * v.scale + v.tx - sx, n.sim.y * v.scale + v.ty - sy) - edge))
    }
    // the plain bubbles of fun mode and the game float over the water the same way
    const box = ref.current?.getBoundingClientRect()
    if (box)
      for (const el of ref.current!.querySelectorAll('[data-stray]')) {
        const r = el.getBoundingClientRect()
        lift(el, Math.max(0, Math.hypot(r.left + r.width / 2 - box.left - sx, r.top + r.height / 2 - box.top - sy) - edge))
      }
  }, [])

  const spawnRipple = useCallback(
    (kind: 'circle' | 'box', x: number, y: number, w = 0, h = 0) => {
      const strength = kind === 'box' ? 0.9 : 0.7
      // a circle may carry its own size (the bubble that just landed); a bare drop is a small one
      const hw = kind === 'box' ? w / 2 : w ? w / 2 : 9
      const hh = kind === 'box' ? h / 2 : h ? h / 2 : 9
      water.current?.ripple(x, y, { hw, hh, strength })
      wave(x, y, kind === 'box' ? (w + h) / 4 : hw, strength)
    },
    [wave],
  )

  /** A ripple around a bubble, with the others bobbing as the wave passes. */
  const rippleFrom = useCallback(
    (id: string) => {
      const n = nodes.current.get(id)
      if (!n) return
      const cv = view.current
      const d = 2 * n.sim.r * cv.scale
      spawnRipple('circle', n.sim.x * cv.scale + cv.tx, n.sim.y * cv.scale + cv.ty, d, d)
    },
    [spawnRipple],
  )
  rippleRef.current = rippleFrom
  /** The same, from a spot on the water (a spare bubble that was popped). */
  const rippleAt = useCallback(
    (x: number, y: number, r: number) => {
      const cv = view.current
      spawnRipple('circle', x * cv.scale + cv.tx, y * cv.scale + cv.ty, 2 * r * cv.scale, 2 * r * cv.scale)
    },
    [spawnRipple],
  )
  // checking an item off (here or from anywhere) sends a ripple out from its bubble
  const doneNow = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    const cur = new Map(visible.map((t) => [t.id, (t.status === 'done' ? 1 : 0) + t.log.length]))
    const prev = doneNow.current
    doneNow.current = cur
    if (!prev) return
    for (const [id, v] of cur) if ((prev.get(id) ?? v) < v) rippleFrom(id)
  }, [visible, rippleFrom])

  // a new item (from the quick-add box) lands: ripple from where its bubble really is
  useEffect(() => {
    const onAdded = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id
      let tries = 0
      const ring = () => {
        const n = nodes.current.get(id)
        if (!n) return tries++ < 30 ? void requestAnimationFrame(ring) : undefined
        const cv = view.current
        const d = 2 * n.sim.r * cv.scale
        spawnRipple('circle', n.sim.x * cv.scale + cv.tx, n.sim.y * cv.scale + cv.ty, d, d)
      }
      requestAnimationFrame(ring)
    }
    window.addEventListener('lilac:added', onAdded)
    return () => window.removeEventListener('lilac:added', onAdded)
  }, [spawnRipple])

  usePondGestures({
    ref,
    view,
    dims,
    applyView,
    zoomAbout,
    select,
    checkOffscreen,
    // in pop mode a tap on the water only ripples: it never starts a new item
    onTap: (p) => {
      if (popRef.current === 'off') {
        // water near a group (below it, or beside one of its bubbles) starts the new item in that group; far from any, it is just a new item
        const cv = view.current
        const wx = (p.x - cv.tx) / cv.scale
        const wy = (p.y - cv.ty) / cv.scale
        let best: { key: string; d: number } | null = null
        for (const c of clusters.current.values()) {
          let d = Infinity
          for (const id of c.ids) {
            const n = nodes.current.get(id)
            if (n) d = Math.min(d, Math.hypot(n.sim.x - wx, n.sim.y - wy) - n.sim.r)
          }
          const lab = labelsRef.current.find((l) => l.key === c.key)
          if (lab) d = Math.min(d, Math.hypot(lab.x - wx, lab.y - wy) - 30)
          d *= cv.scale // (how far it looks on screen, however far the pond is zoomed)
          if (d < 110 && (!best || d < best.d)) best = { key: c.key, d }
        }
        const preset = best ? addHere(best.key) : null
        if (!preset) return false
        const { w: W, h: H } = dims.current
        openCompose({ x: wx / W, y: wy / H }, preset)
        return true
      }
      spawnRipple('circle', p.x, p.y)
      return true
    },
  })

  return (
    <div
      ref={ref}
      className={`relative h-full w-full cursor-[crosshair] touch-none overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_20px_60px_-24px_rgb(var(--lr-700)/0.35)] ${pop ? 'pop-mode' : ''} ${hidden ? 'fun-mode' : ''} ${funReturn ? 'fun-return' : ''}`}
      style={{
        background:
          'radial-gradient(70% 60% at 30% 20%, rgba(255,255,255,0.75), transparent 70%), radial-gradient(60% 60% at 80% 90%, rgb(var(--lr-200)/0.55), transparent 70%), linear-gradient(160deg, rgba(255,255,255,0.5), rgba(240,231,250,0.45))',
      }}
      aria-label="Pond canvas. Tap the water to add a thought. Drag to pan, pinch to zoom."
    >
      <div ref={worldRef} className="absolute left-0 top-0 z-[2] origin-top-left" style={{ width: w, height: h, transform: 'translate(0px,0px) scale(1)' }}>
        {labels.map((l) => (
          <div
            key={l.key}
            ref={(el) => {
              if (!el) return void labelEls.current.delete(l.key)
              labelEls.current.set(l.key, el)
              const st = labelSt.current.get(l.key)
              el.style.transform = st ? `translate(${st.x}px, ${st.y}px)` : ''
            }}
            className="pond-label absolute"
            style={{ left: l.x, top: l.y, zIndex: 5 }}
          >
            <div
              data-ui
              onPointerDown={(e) => dragLabel(e, l.key)}
              title={group === 'folder' ? 'Tap to show just this group (tap again to step back up); drag to move it, or onto another group to put it inside' : 'Drag to move this whole group'}
              style={{ color: l.hue === undefined ? 'var(--color-lilac-700)' : `${tint(l.hue, 50, 36)}` }}
              className={`pop-in -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none whitespace-nowrap relative rounded-full px-3.5 py-1 font-display font-bold italic text-3xl transition-[background-color,box-shadow,opacity,text-shadow] duration-300 hover:bg-white/60 hover:shadow-sm ${
                hot === l.key ? 'bg-white/80 opacity-100 shadow-[0_0_22px_6px_rgba(167,139,250,0.55)] [text-shadow:0_0_1px_currentColor,0_0_10px_rgba(255,255,255,0.9)]' : 'opacity-90'
              }`}
            >
              {l.path && l.path.length > 1 ? (
                <>
                  {/* the groups above, as small underlined links on a line of their own over the name; each moves up to that level */}
                  <span className="block text-center text-[0.42em] font-normal leading-tight not-italic">
                    {l.path.slice(0, -1).map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && (
                          <span className="mx-1 opacity-60" aria-hidden>
                            ›
                          </span>
                        )}
                        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => stepTo(c.id)} className="underline decoration-1 underline-offset-[3px] opacity-70 transition hover:opacity-100">
                          {c.name}
                        </button>
                      </span>
                    ))}
                  </span>
                  <span>
                    {(() => {
                    const f = folders.find((x) => x.id === l.key)
                    return f ? (
                      <span className="mr-1.5 inline-block -translate-y-0.5 align-middle">
                        <Flower hue={f.hue} shape={f.shape} size={26} />
                      </span>
                    ) : null
                  })()}
                    {l.path[l.path.length - 1].name}
                  </span>
                </>
              ) : (
                <>
                  {(() => {
                    const f = folders.find((x) => x.id === l.key)
                    return f ? (
                      <span className="mr-1.5 inline-block -translate-y-0.5 align-middle">
                        <Flower hue={f.hue} shape={f.shape} size={26} />
                      </span>
                    ) : null
                  })()}
                  {l.label}
                </>
              )}
              {folders.find((f) => f.id === l.key)?.workspaceId && (
                <span title="Shared group" aria-label="Shared group" role="img" className="ml-1.5 inline-block align-middle text-[0.5em] not-italic opacity-70">
                  <IconPerson size={16} />
                </span>
              )}
              {addHere(l.key) && (
                // the + beside a group's name makes a subgroup in it (a new item is made by tapping the water near the group)
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => (group === 'folder' ? void newSubgroup(l.key) : openCompose(null, addHere(l.key)!))}
                  aria-label={group === 'folder' ? `New subgroup in ${l.label}` : `New item in ${l.label}`}
                  title={group === 'folder' ? `New subgroup in ${l.label}` : `New item in ${l.label}`}
                  className="ml-2 inline-grid h-6 w-6 -translate-y-0.5 place-items-center rounded-full bg-white/65 align-middle font-sans text-base font-normal not-italic leading-none text-lilac-700 shadow-sm transition hover:scale-110 hover:bg-white"
                >
                  +
                </button>
              )}
              <span
                aria-hidden
                className={`pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap font-sans text-xs font-medium not-italic text-lilac-700 transition-opacity duration-300 ${hot === l.key ? 'opacity-100' : 'opacity-0'}`}
              >
                Add to group
              </span>
            </div>
          </div>
        ))}

        {w > 0 &&
          visible.map((t) => <Lily key={t.id} task={t} r={radius(t)} api={api} start={{ x: t.x * w, y: t.y * h }} match={matcher ? matcher(t) : null} />)}
        {w > 0 && (
          <Strays
            ref={field}
            getArea={() => {
              const v = view.current
              const { w: W, h: H } = dims.current
              const i = freeInset.current
              return { x0: (i.l - v.tx) / v.scale, x1: (W - i.r - v.tx) / v.scale, y0: (i.t - v.ty) / v.scale, y1: (H - i.b - v.ty) / v.scale, scale: v.scale }
            }}
            onCleared={setCleared}
            active={pop && popMode !== 'delete' && !limit.locked}
            w={w}
            h={h}
            // for fun and in the game every bubble is a plain one (the real ones are put away), starting where the real ones were
            seeded={playful}
            getSeed={() => {
              // each real bubble as it looks right now (where it has drifted to, and its size), so the plain one takes over exactly in its place
              const byId = new Map(visible.map((t) => [t.id, t]))
              const v = view.current
              const box = ref.current?.getBoundingClientRect()
              return [...nodes.current].map(([id, n]) => {
                const t = byId.get(id)
                const pad = els.current.get(id)?.outer.querySelector('.pad')?.getBoundingClientRect()
                const hue = t ? bubbleHue(t, folders) : 285
                const u = Math.max(0.5, t ? effectiveUrgency(t) : 0.5)
                if (!pad || !box || pad.width === 0) return { x: n.sim.x, y: n.sim.y, r: n.sim.r, hue, u }
                return { x: (pad.left + pad.width / 2 - box.left - v.tx) / v.scale, y: (pad.top + pad.height / 2 - box.top - v.ty) / v.scale, r: pad.width / 2 / v.scale, hue, u }
              })
            }}
            hues={popMode === 'game' ? gamePalette : undefined}
            litHue={popMode === 'game' && game.g.lit !== null ? gamePalette[game.g.lit] : null}
            canPop={(hue) => popRef.current !== 'game' || (gameRef.current.g.phase === 'play' && gamePalette.includes(hue))}
            onPop={(hue, x, y, r) => {
              addPopStats({ popped: 1 })
              rippleAt(x, y, r)
              if (popRef.current === 'game') gameRef.current.tap(gamePalette.indexOf(hue))
            }}
            getAvoid={() => [...nodes.current.values()].map((n) => ({ x: n.sim.x, y: n.sim.y, r: n.sim.r }))}
          />
        )}
      </div>

      <WaterRipples ref={water} className="z-[1]" />
      {cleared && (
        // a soft word on the water: it fades in, stays a moment and fades out before the bubbles come back
        <p aria-live="polite" className="all-cleared pointer-events-none absolute inset-0 z-[1] grid place-items-center font-display text-4xl italic text-lilac-700/70">
          All cleared!
        </p>
      )}

      {visible.length === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center font-display text-xl italic text-ink-faint">Touch the water to float an idea…</p>
      )}
      {visible.length > 0 && !phone && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 hidden pl-32 pr-40 text-left text-xs text-ink-faint/80 sm:block">
          {popMode === 'delete' ? 'Delete mode: popping a bubble deletes its task · undo brings it back' : popMode === 'fun' ? 'Fun mode: pop away, nothing is deleted' : popMode === 'game' ? 'Pop game: watch the colours, then pop them in the same order' : 'Click the water to add (near a group, to add to it) · drag to wander · scroll or pinch to zoom'}
        </p>
      )}

      {/* top right: pop mode (fun by default; deleting has to be chosen) and the pop game. bottom right: zoom. bottom left: frame all */}
      <div data-ui className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {pop && (
          <SegmentedToggle
            label="What popping does"
            iconsOnly
            tones={{ delete: 'bg-[#c4577e] shadow-[#c4577e]/35' }}
            value={popMode as 'fun' | 'game' | 'delete'}
            onChange={(v) => {
              if (v !== 'delete' && limit.blocked()) return // (a break: say so, and stay where we are)
              setPopMode(v)
            }}
            options={[
              { id: 'fun', label: 'Fun', icon: <IconPop size={14} /> },
              { id: 'game', label: 'Game', icon: <IconGame size={14} /> },
              { id: 'delete', label: 'Delete', icon: <IconTrash size={14} /> },
            ]}
          />
        )}
        <Tip label={pop ? 'Stop popping' : 'Pop mode: pop bubbles for fun'}>
          <button
            onClick={() =>
              setPopMode((m) => {
                if (m !== 'off') return 'off'
                // during a break, popping is only for deleting
                return limit.blocked() ? 'delete' : 'fun'
              })
            }
            aria-pressed={pop}
            aria-label="Pop mode"
            className={`grid h-9 w-9 place-items-center rounded-full transition ${pop ? (popMode === 'delete' ? 'bg-[#c4577e] text-white shadow-md shadow-[#c4577e]/35' : 'bg-lilac-500 text-white shadow-md shadow-lilac-500/40') : 'glass-soft text-ink-soft hover:bg-white/80'}`}
          >
            <IconPop size={19} />
          </button>
        </Tip>
      </div>
      {popMode === 'game' && <PopGameBar game={game} palette={gamePalette} breakText={limit.breakText} />}
      {limit.warn !== null && popMode !== 'delete' && <PlayTimer seconds={limit.warn} />}
      {limit.lastGame && popMode === 'game' && limit.warn === null && <PlayTimer lastGame />}
      {limit.note && !(popMode === 'game' && game.g.phase === 'over') && (
        // (the game's own results box says it when a game has just ended)
        // a kind word in the middle of the water when it is time for a break (or play is tried too soon)
        <p key={limit.note.key} role="status" className="break-note pointer-events-none absolute inset-0 z-20 grid place-items-center px-6">
          <span className="glass max-w-sm rounded-2xl !bg-white/95 px-6 py-4 text-center font-display text-xl italic leading-snug text-lilac-700">{limit.note.text}</span>
        </p>
      )}
      {popMode === 'off' && <PondMembers />}
      {popMode === 'delete' && (
        // short, top left where the game's score sits, so it covers next to nothing
        <div data-ui className="pointer-events-none absolute left-3 top-3 z-10">
          <div role="alert" className="rounded-full bg-[#c4577e] px-3.5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-[#c4577e]/35">
            Pop to delete!
          </div>
        </div>
      )}
      <div data-ui className="absolute bottom-3 right-3 z-10">
        <ZoomControl onZoom={(f) => zoomAbout(f, w / 2, h / 2)} />
      </div>
      {/* off-screen bubbles: a soft glowing dot rides along the frame where a line from the middle to each one crosses it (it fades in when the
          bubble leaves the screen, and out when it comes back); tap one to glide there */}
      {!playful &&
        dots.map((d) => (
          <button
            key={d.id}
            data-ui
            type="button"
            ref={(el) => {
              if (!el) return void dotEls.current.delete(d.id)
              dotEls.current.set(d.id, el)
              const at = dotAt.current.get(d.id)
              if (at) {
                el.style.left = `${at.x}px`
                el.style.top = `${at.y}px`
              }
            }}
            onClick={() => {
              const at = dotAt.current.get(d.id)
              if (!at) return
              const { w: W, h: H } = dims.current
              const v = view.current
              view.current = { scale: v.scale, tx: W / 2 - at.to.x * v.scale, ty: H / 2 - at.to.y * v.scale }
              applyView(true)
            }}
            aria-label="A bubble out of view this way: go there"
            title="A bubble out of view this way"
            className={`edge-dot absolute z-[5] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${d.leaving ? 'leaving' : ''}`}
            style={{ ['--h' as string]: Math.max(0, d.hue), ['--s' as string]: d.hue < 0 ? 0 : 1 }}
          />
        ))}
      <div data-ui className="absolute bottom-3 left-3 z-10">
        <Tip label="Frame all bubbles">
          <button
            onClick={() => frameAll(false)}
            className={`relative grid h-9 place-items-center rounded-full px-3.5 text-sm transition ${offscreen ? 'bg-lilac-500 text-white shadow-md shadow-lilac-500/40' : 'glass-soft text-ink-soft hover:bg-white/80'}`}
          >
            Frame all
            {offscreen && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-rose-soft" />}
          </button>
        </Tip>
      </div>
    </div>
  )
}
