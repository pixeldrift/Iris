// The Spatial workspace: the task map as a place you look around. This component is the controller (SpatialWorkspace): it chooses the best
// tracking and environment the device allows, falls back step by step (motion, then touch, then a flat canvas when there is no WebGL),
// and tears everything down on exit. The task data is only read; places live in the spatial store.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useVisibleTasks } from '../ui/useVisible'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { Popover } from '../ui/Popover'
import { IconChevron, IconCube, IconSliders } from '../ui/icons'
import { detectCapabilities } from './capabilities'
import { buildContent, sameLayout } from './content'
import { FOV } from './SpatialScene'
import { RADIUS } from './layout'
import { DefaultDot } from '../ui/DefaultDot'
import { CameraEnvironment, PanoramaEnvironment, VirtualEnvironment, type EnvironmentProvider } from './environment'
import { SpatialScene } from './SpatialScene'
import { StaticCanvas } from './StaticCanvas'
import { useSpatial } from './store'
import { SpatialTracking } from './tracking'
import type { EnvironmentKind, TrackingStatus } from './types'

export default function SpatialView() {
  const caps = useMemo(detectCapabilities, [])
  const { environment, tracking: trackPref, render, seen, tipSeen, links, radius } = useSpatial()
  const [fov, setFov] = useState<number>(FOV.start)
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
  const [phase, setPhase] = useState<'intro' | 'running'>('intro')
  const [status, setStatus] = useState<TrackingStatus>({ source: 'touch', quality: 'good' })
  const [note, setNote] = useState<string | null>(null)
  const [env, setEnv] = useState<EnvironmentKind>('virtual')
  const [menu, setMenu] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const track = useRef<SpatialTracking | null>(null)
  const scene = useRef<SpatialScene | null>(null)
  const envRef = useRef<EnvironmentProvider | null>(null)
  const panoUrl = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const live = useRef(content)
  live.current = content

  /* ---------- starting: the first call must be inside the tap (iOS asks for motion permission only from one) ---------- */
  const begin = useCallback(
    (wantMotion: boolean) => {
      prefs({ seen: true })
      const tr = new SpatialTracking()
      track.current = tr
      tr.onStatus((s) => {
        setStatus(s)
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

  /* ---------- the 3D scene ---------- */
  const chooseEnv = useCallback(
    async (kind: EnvironmentKind, url?: string) => {
      const sc = scene.current
      if (!sc) return
      let next: EnvironmentProvider
      if (kind === 'camera') {
        const c = new CameraEnvironment()
        c.onLost = () => {
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
      sc = new SpatialScene(host.current, track.current, {
        onOpen: (id) => select(id),
        onToggle: (id) => toggleDone(id),
        onLayout: (l) => setLayout(l),
        onFov: (f) => setFov(Math.round(f)),
        // a task dropped into another group joins it (and leaves the one it was in)
        onRetag: (id, clusterId) => {
          const st = useStore.getState()
          const t = st.tasks.find((x) => x.id === id)
          if (!t) return
          const have = new Set(st.folders.map((f) => f.id))
          const cur = t.folderIds.find((x) => have.has(x))
          let ids = t.folderIds.filter((x) => x !== cur)
          if (clusterId !== 'none') ids = [clusterId, ...ids.filter((x) => x !== clusterId)]
          st.updateTask(id, { folderIds: ids })
        },
      })
    } catch {
      // the graphics could not start after all: fall back to the flat canvas
      setNote('3D could not start on this device, so here is the flat view.')
      prefs({ render: 'simple' })
      return
    }
    scene.current = sc
    if (location.search.includes('spacetest')) (window as unknown as { __space?: unknown }).__space = { screenPoint: sc.screenPoint.bind(sc), emptyPoint: sc.emptyPoint.bind(sc), fit: () => sc.frameAll(true) }
    sc.setContent(live.current)
    sc.frameAll(true) // (everything in view to begin with; zoom in or look around from there)
    void chooseEnv(environment === 'camera' ? 'virtual' : environment === 'panorama' && !panoUrl.current ? 'virtual' : environment)
    const onVis = () => {
      if (document.visibilityState === 'hidden') sc.pause()
      else {
        sc.resume()
        const e = envRef.current
        if (e instanceof CameraEnvironment && !e.live) void chooseEnv('camera') // (the camera is let go when the page goes away)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      sc.dispose() // (also lets go of the camera and the sky)
      scene.current = null
      envRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, simple])

  useEffect(() => {
    scene.current?.setContent(content)
  }, [content])
  useEffect(() => {
    scene.current?.setLinks(links)
  }, [links, phase, simple])
  useEffect(() => {
    scene.current?.setRadius(radius)
  }, [radius, phase, simple])
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
  const readout = simple ? '' : ` · R ${radius} · ${Math.round(fov)}° · ×${(FOV.start / fov).toFixed(1)}`
  const statusText = (simple || !where ? how : `${where} · ${how}`) + readout

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_20px_60px_-24px_rgb(var(--lr-700)/0.35)]" aria-label="Spatial workspace" role="region">
      {/* where the camera or sky goes sits behind the canvas, in the same box */}
      <div ref={host} className="absolute inset-0 bg-gradient-to-b from-lilac-100 to-white" />
      {phase === 'running' && simple && <StaticCanvas content={content} layout={stored} />}

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
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between">
            <button type="button" onClick={exit} className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/80 py-1.5 pl-2 pr-3.5 text-sm text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
              <span className="rotate-180">
                <IconChevron size={15} />
              </span>
              Back
            </button>
            <button ref={menuBtn} type="button" aria-label="Spatial settings" aria-expanded={menu} onClick={() => setMenu((o) => !o)} className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white/80 text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
              <IconSliders size={17} />
            </button>
          </div>
          <Popover open={menu} onClose={() => setMenu(false)} anchor={menuBtn} align="end" className="w-72 p-3">
            <div className="space-y-3 text-xs font-medium text-ink-soft">
              {!simple && (
                <div>
                  Background
                  <div className="mt-1">
                    <SegmentedToggle
                      label="Background"
                      value={env}
                      options={[
                        { id: 'virtual', label: 'Space' },
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
                  View angle
                  <div className="relative mt-1 pb-1">
                    <input type="range" min={FOV.min} max={FOV.max} step={1} value={fov} aria-label="View angle" onChange={(e) => scene.current?.setFov(Number(e.target.value))} className="soft relative z-10" />
                    <DefaultDot at={(FOV.start - FOV.min) / (FOV.max - FOV.min)} color="#a39cb0" label="Back to the usual view angle" onReset={() => scene.current?.setFov(FOV.start)} />
                  </div>
                  <div className="-mt-2.5 flex justify-between text-[0.68rem] font-normal text-ink-faint">
                    <span>Closer</span>
                    <span>Wider</span>
                  </div>
                </div>
              )}
              {!simple && (
                <div>
                  Radius <span className="font-normal text-ink-faint">{radius}</span>
                  <div className="relative mt-1 pb-1">
                    <input type="range" min={RADIUS.min} max={RADIUS.max} step={1} value={radius} aria-label="Radius" onChange={(e) => prefs({ radius: Number(e.target.value) })} className="soft relative z-10" />
                    <DefaultDot at={(RADIUS.start - RADIUS.min) / (RADIUS.max - RADIUS.min)} color="#a39cb0" label="Back to the usual radius" onReset={() => prefs({ radius: RADIUS.start })} />
                  </div>
                  <div className="-mt-2.5 flex justify-between text-[0.68rem] font-normal text-ink-faint">
                    <span>Wraps around you</span>
                    <span>Flat wall</span>
                  </div>
                </div>
              )}
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
              <div>
                Drawing
                <div className="mt-1">
                  <SegmentedToggle label="Drawing" value={render === 'simple' ? 'simple' : 'auto'} options={[{ id: 'auto', label: '3D' }, { id: 'simple', label: 'Flat' }]} onChange={(r) => prefs({ render: r })} />
                </div>
              </div>
              {!simple && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-1 font-normal">
                  Faint curves between groups and their subgroups
                  <input type="checkbox" checked={links} onChange={(e) => prefs({ links: e.target.checked })} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
                </label>
              )}
              <button type="button" onClick={() => useSpatial.getState().resetLayout()} className="rounded-full bg-white/70 px-3 py-1.5 text-ink-soft transition hover:bg-white">
                Tidy everything back into place
              </button>
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
            {!simple ? (
              <span className="pointer-events-auto flex gap-1.5">
                <button type="button" onClick={() => scene.current?.recenter()} className="whitespace-nowrap rounded-full bg-white/80 px-3.5 py-1.5 text-sm text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
                  Recenter
                </button>
                <button type="button" onClick={() => scene.current?.frameAll()} className="whitespace-nowrap rounded-full bg-white/80 px-3.5 py-1.5 text-sm text-ink-soft shadow-md backdrop-blur transition hover:bg-white">
                  Fit all
                </button>
              </span>
            ) : (
              <span />
            )}
            <span role="status" className="rounded-full bg-white/75 px-3 py-1 text-xs text-ink-soft shadow backdrop-blur">
              {statusText}
            </span>
            {!simple ? (
              <span className="pointer-events-auto flex flex-col gap-1">
                <button type="button" aria-label="Zoom in" onClick={() => scene.current?.zoom(1.25)} className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-lg text-ink-soft shadow-md backdrop-blur hover:bg-white">
                  +
                </button>
                <button type="button" aria-label="Zoom out" onClick={() => scene.current?.zoom(1 / 1.25)} className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-lg text-ink-soft shadow-md backdrop-blur hover:bg-white">
                  −
                </button>
              </span>
            ) : (
              <span />
            )}
          </div>
          {!note && !tipSeen && !simple && (
            <button type="button" onClick={() => prefs({ tipSeen: true })} className="absolute inset-x-6 top-14 z-10 mx-auto max-w-sm rounded-2xl bg-white/85 px-3.5 py-2 text-center text-xs text-ink-soft shadow-md backdrop-blur">
              Drag a task or a group to move it. Pull a task out into the open, then drop it into another group. <span className="text-lilac-600">Got it</span>
            </button>
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
