import { useEffect, useState } from 'react'
import { useExit } from './anim'
import { Flower } from './Flower'

declare const __BUILD_ID__: string

/** Polls /version.json; when the deployed build differs from this one, offers a refresh. */
export function UpdateBubble() {
  const [stale, setStale] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = stale && !dismissed
  const { mounted, closing } = useExit(open, 220)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    let stop = false
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        const { id } = (await r.json()) as { id: string }
        if (!stop && id && id !== __BUILD_ID__) setStale(true)
      } catch {
        /* offline: try again later */
      }
    }
    void check()
    const iv = window.setInterval(check, 5 * 60_000)
    const vis = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('focus', vis)
    return () => {
      stop = true
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('focus', vis)
    }
  }, [])

  if (!mounted) return null

  const refresh = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations()
      await Promise.all((regs ?? []).map((r) => r.unregister()))
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {
      /* best effort */
    }
    location.reload()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[140] flex justify-center px-4" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className={`pointer-events-auto flex items-center gap-1 ${closing ? 'pop-out' : 'pop-in'}`} style={{ ['--oy' as string]: '0%' }}>
        <button
          onClick={refresh}
          className="glass glass-strong flex items-center gap-2.5 rounded-full py-2 pl-3.5 pr-4 text-sm shadow-xl shadow-lilac-500/25 transition hover:scale-[1.03]"
        >
          <Flower hue={285} size={22} />
          <span>
            <b className="font-medium text-lilac-700">A newer Lilac is ready.</b> Tap to refresh
          </span>
        </button>
        <button onClick={() => setDismissed(true)} className="glass-soft grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:text-ink" aria-label="Later">
          ×
        </button>
      </div>
    </div>
  )
}
