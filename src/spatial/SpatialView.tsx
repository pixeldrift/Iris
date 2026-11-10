// The Spatial workspace: the task map as a place you look around. This component is the controller (SpatialWorkspace): it chooses the best
// tracking and environment the device allows, falls back step by step (motion, then touch, then a flat canvas when there is no WebGL),
// and tears everything down on exit. The task data is only read; places live in the spatial store.

import { useShallow } from 'zustand/react/shallow'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useVisibleTasks } from '../ui/useVisible'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { Popover } from '../ui/Popover'
import { IconCube, IconFrameAll, IconLevel, IconSliders } from '../ui/icons'
import { Tip } from '../ui/Tip'
import { detectCapabilities } from './capabilities'
import { addInGroup, dropOutside, endCarry, reparentGroup, retagTask, showCarry } from './actions'
import { buildContent, NONE, sameLayout } from './content'
import { FOV } from './SpatialScene'
import { FLAT_R, RADIUS } from './layout'
import { WallTracking, type WallPhase } from './wall'
import { TrackingCamera } from './trackingCamera'
import { DefaultDot } from '../ui/DefaultDot'
import { ZoomControl } from '../ui/ZoomControl'
import { CameraEnvironment, PanoramaEnvironment, SharedCameraEnvironment, VirtualEnvironment, type EnvironmentProvider } from './environment'
import { SpatialScene } from './SpatialScene'
import { StaticCanvas } from './StaticCanvas'
import { useSpatial } from './store'
import { SpatialTracking } from './tracking'
import type { EnvironmentKind, TrackingStatus } from './types'

export default function SpatialView() {
  const caps = useMemo(detectCapabilities, [])
  // (not the whole store: the layout changes with every drag, and this view does not need to redraw for it)
  const { environment, tracking: trackPref, render, seen, tipSeen, links, tidy, radius, collapsed, wallSteady } = useSpatial(useShallow((s) => ({ environment: s.environment, tracking: s.tracking, render: s.render, seen: s.seen, tipSeen: s.tipSeen, links: s.links, tidy: s.tidy, radius: s.radius, collapsed: s.collapsed, wallSteady: s.wallSteady })))
  const [fov, setFov] = useState<number>(FOV.start)
  const [fitTick, setFitTick] = useState(0)
  const stored = useSpatial((s) => s.layout)
  const setLayout = useSpatial((s) => s.setLayout)
  const prefs = useSpatial((s) => s.set)
  const select = useStore((s) => s.select)
  const toggleDone = useStore((s) => s.toggleDone)
  const setView = useStore((s) => s.setView)
  const lastView = useStore((s) => s.lastView)
  const visible = useVisibleTasks(false)
  const allTasks = useStore((s) => s.tasks)
  const folders = useStore((s) => s.folders)

  const content = useMemo(() => buildContent(visible, allTasks, folders, stored), [visible, allTasks, folders, stored])
  // a place worked out for something new is kept, so it is the same next time
  useEffect(() => {
    if (!sameLayout(content.layout, stored)) setLayout(content.layout)
  }, [content.layout, stored, setLayout])

  const simple = render === 'simple' || !caps.webgl
  // wall mode: the camera finds a flat surface (a sheet, a frame, a wall) and the groups hang flat just in front of it
  const wall = render === 'wall' && caps.webgl && !!navigator.mediaDevices?.getUserMedia
  const [phase, setPhase] = useState<'intro' | 'running'>('intro')
  const [status, setStatus] = useState<TrackingStatus>({ source: 'touch', quality: 'good' })
  const [note, setNote] = useState<string | null>(null)
  // motion that has gone quiet (the page was away): picked up again by itself where it can be; where it cannot, this says so
  const [resuming, setResuming] = useState(false)
  const [pauseClosed, setPauseClosed] = useState(false)
  const [env, setEnv] = useState<EnvironmentKind>('virtual')
  const [menu, setMenu] = useState(false)
  const showPaused = !!status.paused && !resuming && !pauseClosed
  const host = useRef<HTMLDivElement>(null)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const track = useRef<SpatialTracking | null>(null)
  const wallTrack = useRef<WallTracking | null>(null)
  const wallCam = useRef<TrackingCamera | null>(null)
  const [wallPhase, setWallPhase] = useState<WallPhase>('searching')
  // tracking details (Wall mode): speed, fit quality, and each followed point drawn twice (where the tracker saw it, where the scene draws it)
  const [details, setDetails] = useState(() => {
    try {
      return localStorage.getItem('lilac-walldetails') === '1'
    } catch {
      return false
    }
  })
  const dbgCanvas = useRef<HTMLCanvasElement>(null)
  const [hud, setHud] = useState('')
  const scene = useRef<SpatialScene | null>(null)
  const envRef = useRef<EnvironmentProvider | null>(null)
  const panoUrl = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // a folded group takes its subgroups (and everything in them) with it: only its name is left, with the count of all it holds
  const shownContent = useMemo(() => {
    const byId = new Map(content.clusters.map((c) => [c.id, c]))
    const hidden = (id: string): boolean => {
      for (let p = byId.get(id)?.parent; p; p = byId.get(p)?.parent) if (collapsed[p]) return true
      return false
    }
    const total = new Map<string, number>()
    for (const c of content.clusters) for (let p: string | null | undefined = c.id; p; p = byId.get(p)?.parent) total.set(p, (total.get(p) ?? 0) + c.count)
    const keep = new Set(content.clusters.filter((c) => !hidden(c.id)).map((c) => c.id))
    return {
      ...content,
      clusters: content.clusters.filter((c) => keep.has(c.id)).map((c) => ({ ...c, collapsed: !!collapsed[c.id], count: collapsed[c.id] ? (total.get(c.id) ?? c.count) : c.count })),
      tasks: content.tasks.filter((t) => t.cluster === NONE || keep.has(t.cluster)), // (a loose task is in no group, so no fold can hide it)
    }
  }, [content, collapsed])
  const live = useRef(shownContent)
  live.current = shownContent

  /* ---------- starting: the first call must be inside the tap (iOS asks for motion permission only from one) ---------- */
  const begin = useCallback(
    (wantMotion: boolean) => {
      prefs({ seen: true })
      const tr = new SpatialTracking()
      track.current = tr
      tr.onStatus((s) => {
        setStatus(s)
        if (!s.paused) setPauseClosed(false)
        if (s.note) setNote(s.note)
      })
      const asked = !simple && wantMotion && trackPref !== 'touch' && caps.motion ? tr.start(true) : tr.start(false)
      setPhase('running')
      void asked.then((ok) => {
        if (!ok && wantMotion && trackPref !== 'touch' && caps.motion && !simple) setNote('Motion tracking was not allowed, so you can look around by dragging. You can switch it on again from the settings button.')
      })
    },
    [prefs, simple, trackPref, caps.motion],
  )
  // where no permission has to be asked for, and it has been explained once, go straight in
  useEffect(() => {
    if (phase === 'intro' && seen && !caps.motionNeedsPermission) begin(true)
  }, [phase, seen, caps.motionNeedsPermission, begin])

  useEffect(() => {
    if (!wall || !details || phase !== 'running') return void setHud('')
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      const sc = scene.current
      const wt = wallTrack.current
      const cv = dbgCanvas.current
      if (!sc || !wt || !cv) return
      const r = cv.getBoundingClientRect()
      if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) {
        cv.width = Math.round(r.width)
        cv.height = Math.round(r.height)
      }
      const g = cv.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, cv.width, cv.height)
      const d = sc.wallDebug()
      for (let i = 0; i < d.tracked.length; i++) {
        const [tx, ty] = d.tracked[i]
        const [dx, dy] = d.drawn[i]
        g.strokeStyle = 'rgba(255,80,160,0.6)'
        g.beginPath()
        g.moveTo(tx, ty)
        g.lineTo(dx, dy)
        g.stroke()
        g.fillStyle = 'rgb(40,210,120)' // where the tracker saw it
        g.fillRect(tx - 2, ty - 2, 4, 4)
        g.fillStyle = 'rgb(255,150,30)' // where the scene draws it
        g.fillRect(dx - 2, dy - 2, 4, 4)
      }
      if (t - last > 400) {
        last = t
        const s = wt.diagnostics()
        setHud(
          `${s.phase} · camera ${s.camFps.toFixed(0)}/s, followed ${s.fps.toFixed(0)}/s · ${s.ms.toFixed(0)} ms each (worst ${s.max.toFixed(0)})\n` +
            `${s.points} points · fit off by ${s.resid.toFixed(2)} px · lost ${s.lostCount}x\n` +
            `lens ${s.fovV.toFixed(0)}° ${s.auto ? '(learned)' : '(set)'} · gyro vs camera ${s.gyroGap.toFixed(1)}°`,
        )
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [wall, details, phase])

  useEffect(() => {
    wallTrack.current?.configure({ smooth: wallSteady })
  }, [wallSteady, wall, phase])

  /* ---------- the 3D scene ---------- */
  const chooseEnv = useCallback(
    async (kind: EnvironmentKind, url?: string) => {
      const sc = scene.current
      if (!sc) return
      let next: EnvironmentProvider
      if (kind === 'camera') {
        const c = wallCam.current ? new SharedCameraEnvironment(wallCam.current) : new CameraEnvironment()
        if (c instanceof CameraEnvironment) c.onLost = () => {
          setNote('The camera stopped, so you are back in the virtual room.')
          void chooseEnv('virtual')
        }
        next = c
      } else if (kind === 'panorama' && (url ?? panoUrl.current)) {
        panoUrl.current = url ?? panoUrl.current
        next = new PanoramaEnvironment(panoUrl.current!)
      } else next = new VirtualEnvironment()
      const ok = await sc.setEnvironment(next)
      if (!ok) {
        if (kind === 'camera') setNote('The camera was not available (or not allowed), so you are in the virtual room. You can allow it in your browser settings.')
        else if (kind === 'panorama') setNote('That picture could not be opened, so you are in the virtual room.')
        const fallback = new VirtualEnvironment()
        await sc.setEnvironment(fallback)
        envRef.current = fallback
        setEnv('virtual')
        prefs({ environment: 'virtual' })
        return
      }
      envRef.current = next
      setEnv(next.kind)
      prefs({ environment: next.kind })
    },
    [prefs],
  )

  useEffect(() => {
    if (phase !== 'running' || simple || !host.current || !track.current) return
    let sc: SpatialScene
    try {
      let wt: WallTracking | undefined
      if (wall) {
        wt = new WallTracking()
        wt.smoothing = useSpatial.getState().wallSteady
        wt.device = (q, ageMs) => track.current?.deviceRaw(q, ageMs) ?? false
        wt.onStatus(() => setWallPhase(wt!.phase))
        wallTrack.current = wt
        wallCam.current = new TrackingCamera()
        setWallPhase('searching')
      }
      sc = new SpatialScene(host.current, track.current, {
        onOpen: (id) => select(id),
        onToggle: (id) => toggleDone(id),
        onLayout: (l) => setLayout(l),
        onCollapse: (id) => useSpatial.getState().toggleCollapsed(id),
        // a group let go over another group's name goes inside it
        onReparent: reparentGroup,
        // carried out over the sidebar: its groups light up, and letting go there drops it the way the other views do
        onCarry: (kind, id, x, y) => showCarry(kind, id, kind === 'task' ? (live.current.tasks.find((t) => t.id === id)?.title ?? 'Task') : (live.current.clusters.find((c) => c.id === id)?.name ?? 'Group'), x, y),
        onCarryEnd: endCarry,
        onDropOut: dropOutside,
        onAddIn: addInGroup,
        onFov: (f) => setFov(Math.round(f)),
        // wall mode: the camera shows until the surface has been found, then gives way to the virtual wall (unless the camera is the background)
        onWallReveal: (r) => {
          if (envRef.current?.kind !== 'camera') wallCam.current?.setReveal(r)
        },
        // a task dropped into another group joins it (and leaves the one it was in)
        onRetag: retagTask,
      }, wt)
    } catch {
      // the graphics could not start after all: fall back to the flat canvas
      setNote('3D could not start on this device, so here is the flat view.')
      prefs({ render: 'simple' })
      return
    }
    scene.current = sc
    if (location.search.includes('spacetest')) (window as unknown as { __space?: unknown }).__space = { screenPoint: sc.screenPoint.bind(sc), emptyPoint: sc.emptyPoint.bind(sc), blankInPlate: sc.blankInPlate.bind(sc), fit: () => sc.frameAll(true), probe: () => sc.wallProbe(), dbg: () => sc.wallDebug(), diag: () => (sc as unknown as { wall: { diagnostics: () => unknown } }).wall.diagnostics(), dbgTasks: () => { const s = sc as unknown as { tasks: Map<string, { mesh: { visible: boolean; position: { x: number; y: number; z: number } } }>; layout: { tasks: Record<string, unknown> } }; return [...s.tasks].slice(0, 40).map(([id, n]) => [id, n.mesh.visible, Math.round(n.mesh.position.x), Math.round(n.mesh.position.y), Math.round(n.mesh.position.z), JSON.stringify(s.layout.tasks[id])]) }, surf: () => (sc as unknown as { wall: { getSurface: () => unknown } }).wall.getSurface() }
    sc.setContent(live.current)
    sc.frameAll(true) // (everything in view to begin with; zoom in or look around from there)
    if (wall) {
      // wall mode needs the camera: if it is not allowed, say so and go back to 3D
      // (the tracker's own camera runs whatever the background is; the background is then chosen as usual)
      const cam = wallCam.current!
      void cam.start(host.current!).then((ok) => {
        if (!ok) {
          setNote('Wall mode needs the camera, which was not available (or not allowed), so here is the 3D view.')
          prefs({ render: 'auto' })
          return
        }
        wallTrack.current?.attach(cam.video!)
        void wallTrack.current?.start()
        cam.onLost = () => setNote('The camera stopped. Choose Wall again to start it.')
        void chooseEnv(environment === 'panorama' && !panoUrl.current ? 'virtual' : environment)
      })
    } else void chooseEnv(environment === 'camera' ? 'virtual' : environment === 'panorama' && !panoUrl.current ? 'virtual' : environment)
    const onVis = () => {
      if (document.visibilityState === 'hidden') sc.pause()
      else {
        sc.resume()
        const tr = track.current
        if (tr?.paused) {
          setResuming(true)
          void tr.resume().finally(() => setResuming(false))
        }
        const e = envRef.current
        if (e instanceof CameraEnvironment && !e.live) void chooseEnv('camera') // (the camera is let go when the page goes away)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      wallTrack.current?.stop()
      wallTrack.current = null
      wallCam.current?.stop()
      wallCam.current = null
      sc.dispose() // (also lets go of the camera and the sky)
      scene.current = null
      envRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, simple, wall])

  useEffect(() => {
    scene.current?.setContent(shownContent)
  }, [shownContent])
  useEffect(() => {
    scene.current?.setLinks(links)
  }, [links, phase, simple])
  useEffect(() => {
    scene.current?.setRadius(wall ? FLAT_R : radius)
  }, [radius, phase, simple, wall])
  useEffect(() => {
    scene.current?.setTidy(tidy)
  }, [tidy, phase, simple])
  // leaving: stop the sensors
  useEffect(
    () => () => {
      track.current?.stop()
      if (panoUrl.current) URL.revokeObjectURL(panoUrl.current)
    },
    [],
  )

  const exit = () => setView(lastView === 'spatial' ? 'pond' : lastView)

  /* ---------- what is shown ---------- */
  const where = env === 'camera' ? 'Camera' : env === 'panorama' ? 'Panorama' : ''
  const how = simple ? 'Flat view' : status.source === 'motion' ? 'Motion tracking' : 'Touch navigation'
  const statusText = simple || !where ? how : `${where} · ${how}`

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_20px_60px_-24px_rgb(var(--lr-700)/0.35)]" aria-label="Spatial workspace" role="region">
      {/* where the camera or sky goes sits behind the canvas, in the same box */}
      <div ref={host} className="absolute inset-0 bg-gradient-to-b from-lilac-100 to-white" />
      {phase === 'running' && simple && <StaticCanvas content={shownContent} layout={stored} fitTick={fitTick} />}

      {phase === 'intro' && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-white/55 p-5 backdrop-blur-sm">
          <div className="glass glass-strong w-full max-w-sm rounded-3xl p-5 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-lilac-100 text-lilac-600">
              <IconCube size={24} />
            </span>
            <h2 className="mt-3 font-display text-2xl italic">Look around your tasks</h2>
            <p className="mt-2 text-sm text-ink-soft">
              {simple
                ? 'Your groups and tasks side by side on a canvas you can drag around and zoom.'
                : 'Your groups hang around you like notes on a wall, each subgroup under its group. Turn your phone to look around, or drag empty space. Drag any task or group to move it (a task let go over another group joins it; in open space it floats until you drop it into one). Tap a task to open it, its circle to tick it off.'}
            </p>
            {!simple && caps.motion && <p className="mt-2 text-xs text-ink-faint">Your phone will ask to use its motion sensors. Nothing leaves the device, and you can use touch instead.</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => begin(true)} className="rounded-full bg-lilac-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
                {simple || !caps.motion ? 'Start' : 'Start looking around'}
              </button>
              {!simple && caps.motion && (
                <button type="button" onClick={() => begin(false)} className="rounded-full px-5 py-2 text-sm text-ink-soft transition hover:bg-white/70">
                  Use touch only
                </button>
              )}
              <button type="button" onClick={exit} className="rounded-full px-5 py-1.5 text-xs text-ink-faint transition hover:text-ink">
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <>
          {wall && details && (
            <>
              <canvas ref={dbgCanvas} data-wall-debug className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />
              <pre className="pointer-events-none absolute left-3 top-14 z-10 whitespace-pre rounded-lg bg-black/55 px-2 py-1 font-mono text-[0.62rem] leading-tight text-white">{hud}</pre>
            </>
          )}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between">
            <span className="pointer-events-auto">
              <SegmentedToggle label="Drawing" value={render === 'simple' ? 'simple' : render === 'wall' ? 'wall' : 'auto'} options={[...(caps.webgl && !!navigator.mediaDevices?.getUserMedia ? [{ id: 'wall' as const, label: 'Wall' }] : []), { id: 'auto' as const, label: 'Virtual' }, { id: 'simple' as const, label: '2D' }]} onChange={(r) => prefs({ render: r })} />
            </span>
            <button ref={menuBtn} type="button" aria-label="Spatial settings" aria-expanded={menu} onClick={() => setMenu((o) => !o)} className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white/80 text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
              <IconSliders size={17} />
            </button>
          </div>
          <Popover open={menu} onClose={() => setMenu(false)} anchor={menuBtn} align="end" className="w-72 p-3">
            <div className="space-y-3 text-xs font-medium text-ink-soft">
              {!simple && caps.motion && (
                <div>
                  Looking around
                  <div className="mt-1">
                    <SegmentedToggle
                      label="Looking around"
                      value={trackPref}
                      options={[
                        { id: 'auto', label: 'Automatic' },
                        { id: 'motion', label: 'Motion' },
                        { id: 'touch', label: 'Touch only' },
                      ]}
                      onChange={(m) => {
                        prefs({ tracking: m })
                        const tr = track.current
                        if (!tr) return
                        if (m === 'touch') tr.disableMotion()
                        else if (!tr.motion) void tr.start(true).then((ok) => !ok && setNote('Motion tracking is not available, so you can look around by dragging.'))
                      }}
                    />
                  </div>
                </div>
              )}
              {!simple && (
                <div>
                  Background
                  <div className="mt-1">
                    <SegmentedToggle
                      label="Background"
                      value={env}
                      options={[
                        { id: 'virtual', label: 'Virtual' },
                        { id: 'camera', label: 'Camera' },
                        { id: 'panorama', label: 'Photo' },
                      ]}
                      onChange={(k) => {
                        if (k === 'panorama') fileInput.current?.click()
                        else void chooseEnv(k)
                      }}
                    />
                  </div>
                </div>
              )}
              {!simple && (
                <div>
                  {wall ? 'Camera angle' : 'View angle'}
                  <div className="relative mt-1 pb-1">
                    <input type="range" min={FOV.min} max={FOV.max} step={1} value={fov} aria-label={wall ? 'Camera angle' : 'View angle'} onChange={(e) => { const v = Number(e.target.value); scene.current?.setFov(v); wallTrack.current?.configure({ fovV: v }) }} className="soft relative z-10" />
                    <DefaultDot at={(FOV.start - FOV.min) / (FOV.max - FOV.min)} label="Back to the usual view angle" onReset={() => scene.current?.setFov(FOV.start)} />
                  </div>
                  <div className="-mt-2.5 flex justify-between text-[0.68rem] font-normal text-ink-faint">
                    <span>Closer</span>
                    <span>Wider</span>
                  </div>
                </div>
              )}
              {wall && (
                <div>
                  Smoothing
                  <div className="relative mt-1 pb-1">
                    <input type="range" min={0} max={1} step={0.05} value={wallSteady} aria-label="Smoothing" onChange={(e) => prefs({ wallSteady: Number(e.target.value) })} className="soft relative z-10" />
                    <DefaultDot at={0.15} label="Back to the usual smoothing" onReset={() => prefs({ wallSteady: 0.15 })} />
                  </div>
                  <div className="-mt-2.5 flex justify-between text-[0.68rem] font-normal text-ink-faint">
                    <span>Responsive</span>
                    <span>Steady</span>
                  </div>
                </div>
              )}
              {wall && (
                <label className="flex items-center gap-2 font-normal">
                  <input
                    type="checkbox"
                    checked={details}
                    onChange={(e) => {
                      setDetails(e.target.checked)
                      try {
                        localStorage.setItem('lilac-walldetails', e.target.checked ? '1' : '0')
                      } catch {
                        /* not saved */
                      }
                    }}
                  />
                  Show tracking details
                </label>
              )}
              {!simple && !wall && (
                <div>
                  Radius <span className="font-normal text-ink-faint">{radius}</span>
                  <div className="relative mt-1 pb-1">
                    <input type="range" min={RADIUS.min} max={RADIUS.max} step={1} value={radius} aria-label="Radius" onChange={(e) => prefs({ radius: Number(e.target.value) })} className="soft relative z-10" />
                    <DefaultDot at={(RADIUS.start - RADIUS.min) / (RADIUS.max - RADIUS.min)} label="Back to the usual radius" onReset={() => prefs({ radius: RADIUS.start })} />
                  </div>
                  <div className="-mt-2.5 flex justify-between text-[0.68rem] font-normal text-ink-faint">
                    <span>Wraps around you</span>
                    <span>Flat wall</span>
                  </div>
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-1 font-normal">
                <span>
                  Keep tidy
                  <span className="block text-[0.68rem] text-ink-faint">things you let go settle onto a grid</span>
                </span>
                <input type="checkbox" checked={tidy} onChange={(e) => prefs({ tidy: e.target.checked })} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
              </label>
              {!simple && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-1 font-normal">
                  Connecting lines
                  <input type="checkbox" checked={links} onChange={(e) => prefs({ links: e.target.checked })} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
                </label>
              )}
            </div>
          </Popover>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            aria-label="Choose a panorama photo"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const url = URL.createObjectURL(f)
              void chooseEnv('panorama', url)
            }}
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-2">
            <span className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              {!simple && !wall && (
                <button type="button" onClick={() => scene.current?.recenter()} className="whitespace-nowrap rounded-full bg-white/80 px-3.5 py-1.5 text-sm text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
                  Recenter
                </button>
              )}
              {wall && (
                <button
                  type="button"
                  data-wall-status={wallPhase}
                  aria-label={wallPhase === 'holding' ? 'Surface held. Tap to look for the surface again' : 'Surface not found. Point at a wall, a sheet of paper or a picture frame, or tap to use what the camera sees'}
                  onClick={() => (wallPhase === 'holding' ? scene.current?.recenter() : wallTrack.current?.anchorHere())}
                  className="glass-soft grid h-10 w-10 touch-none select-none place-items-center rounded-full text-lilac-600 transition hover:bg-white/80 active:scale-95"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                    <rect x="5" y="5" width="14" height="14" rx="2.5" strokeOpacity={wallPhase === 'holding' ? 0.55 : 0.3} strokeDasharray={wallPhase === 'holding' ? undefined : '2 2.4'} />
                    {[[5, 5], [19, 5], [5, 19], [19, 19]].map(([x, y]) => (
                      <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="currentColor" stroke="none" />
                    ))}
                    {wallPhase === 'holding' ? (
                      <>
                        {/* a target: tap to look for the surface again */}
                        <circle cx="12" cy="12" r="3.3" />
                        <path d="M12 7.3v2.3M12 14.4v2.3M7.3 12h2.3M14.4 12h2.3" strokeLinecap="round" />
                        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
                      </>
                    ) : (
                      <path d="M9.9 9.7a2.2 2.2 0 1 1 3.2 2c-.7.4-1.1.8-1.1 1.6M12 15.9v.1" strokeLinecap="round" strokeWidth="1.6" />
                    )}
                  </svg>
                </button>
              )}
              {wall && (
                <>
                  <Tip label="Level and straight on: face the groups this way">
                    <button type="button" aria-label="Level and straight on" onClick={() => scene.current?.levelNow()} className="glass-soft grid h-10 w-10 touch-none select-none place-items-center rounded-full text-ink-soft transition hover:bg-white/80 active:scale-95">
                      <IconLevel size={22} />
                    </button>
                  </Tip>
                  <Tip label="Frame all">
                    <button type="button" aria-label="Frame all" onClick={() => scene.current?.frameAll()} className="glass-soft grid h-10 w-10 touch-none select-none place-items-center rounded-full text-ink-soft transition hover:bg-white/80 active:scale-95">
                      <IconFrameAll size={22} />
                    </button>
                  </Tip>
                </>
              )}
              {!wall && <button type="button" onClick={() => (simple ? setFitTick((n) => n + 1) : scene.current?.frameAll())} className="whitespace-nowrap rounded-full bg-white/80 px-3.5 py-1.5 text-sm text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
                Fit all
              </button>}
              {!wall && <button
                type="button"
                onClick={() => {
                  useSpatial.getState().resetLayout()
                  setTimeout(() => (simple ? setFitTick((n) => n + 1) : scene.current?.frameAll()), 400)
                }}
                className="whitespace-nowrap rounded-full bg-white/80 px-3.5 py-1.5 text-sm text-ink-soft shadow-md backdrop-blur transition hover:bg-white"
              >
                Clean up
              </button>}
            </span>
            <span role="status" className="sr-only">
              {statusText}
            </span>
            {!simple ? <ZoomControl className="pointer-events-auto" onZoom={(f) => scene.current?.zoom(f)} /> : <span />}
          </div>
          {!note && !showPaused && !tipSeen && !simple && (
            <button type="button" onClick={() => prefs({ tipSeen: true })} className="absolute inset-x-6 top-14 z-10 mx-auto max-w-sm rounded-2xl bg-white/85 px-3.5 py-2 text-center text-xs text-ink-soft shadow-md backdrop-blur">
              Drag a task or a group to move it. Pull a task out into the open, then drop it into another group. <span className="text-lilac-600">Got it</span>
            </button>
          )}
          {showPaused && (
            <div role="status" className="absolute inset-x-6 top-14 z-10 mx-auto flex max-w-sm items-center gap-2 rounded-2xl bg-white/90 py-2 pl-3.5 pr-2 text-xs text-ink-soft shadow-md backdrop-blur">
              <span className="min-w-0 flex-1">Motion tracking paused.</span>
              <button type="button" onClick={() => void track.current?.resume().then((ok) => !ok && setNote('Motion tracking is not available right now, so you can look around by dragging.'))} className="whitespace-nowrap rounded-full bg-lilac-500 px-3 py-1 text-white transition hover:bg-lilac-600">
                Resume
              </button>
              <button type="button" onClick={() => track.current?.disableMotion()} className="whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-ink-soft ring-1 ring-lilac-200 transition hover:bg-white">
                Use touch
              </button>
              <button type="button" aria-label="Dismiss" onClick={() => setPauseClosed(true)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/80 hover:text-ink">
                ✕
              </button>
            </div>
          )}
          {note && (
            <p role="status" className="absolute inset-x-6 top-14 z-10 mx-auto max-w-sm rounded-2xl bg-white/85 px-3.5 py-2 text-center text-xs text-ink-soft shadow-md backdrop-blur" onClick={() => setNote(null)}>
              {note}
            </p>
          )}
          {/* the same tasks as a plain list for screen readers and the keyboard (the 3D canvas cannot be read aloud) */}
          <ul className="sr-only" aria-label="Tasks in your workspace">
            {content.tasks.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => select(t.id)}>
                  {t.title || 'Untitled'}
                </button>
                <button type="button" onClick={() => toggleDone(t.id)}>
                  {t.done ? 'Mark not done' : 'Mark done'}: {t.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
