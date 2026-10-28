import { useRef } from 'react'
import { useStore } from '../state/store'
import { useExit } from './anim'

/** Small status bubble, e.g. "Carried 2 unfinished tasks forward". */
export function ToastHost() {
  const toast = useStore((s) => s.toast)
  const last = useRef(toast)
  if (toast) last.current = toast
  const { mounted, closing } = useExit(!!toast, 220)
  if (!mounted || !last.current) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[130] flex justify-center px-4" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
      <div
        role="status"
        className={`glass glass-strong rounded-full px-5 py-2.5 text-sm text-lilac-700 shadow-xl shadow-lilac-500/20 ${closing ? 'pop-out' : 'pop-in'}`}
        style={{ ['--oy' as string]: '100%' }}
      >
        {last.current.text}
        {last.current.action && (
          <button
            onClick={() => {
              last.current?.action?.run()
              useStore.setState({ toast: null })
            }}
            className="pointer-events-auto ml-3 font-semibold text-lilac-600 underline-offset-2 hover:underline"
          >
            {last.current.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
