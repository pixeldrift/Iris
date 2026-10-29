import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useExit } from './anim'

interface ConfirmSpec {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface DialogState {
  spec: (ConfirmSpec & { resolve: (ok: boolean) => void }) | null
  open: boolean
}

const useDialog = create<DialogState>(() => ({ spec: null, open: false }))

/** Styled replacement for window.confirm. Resolves true when confirmed. */
export function askConfirm(spec: ConfirmSpec): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.setState({ spec: { ...spec, resolve }, open: true })
  })
}

function close(ok: boolean) {
  const s = useDialog.getState().spec
  useDialog.setState({ open: false })
  s?.resolve(ok)
}

/** Generic centered modal with a springy pop-in/out. */
export function Modal({
  open,
  onClose,
  children,
  label,
  wide,
  footer,
  crop = null,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  label: string
  wide?: boolean
  /** Save / Cancel / Delete and the like: pinned to the bottom of the dialog, so they never scroll away with the content. */
  footer?: React.ReactNode
  /** Shrink the dialog to just this box (insets from its own edges, px) so what a control changes behind it can be watched; null grows it back out. */
  crop?: { top: number; right: number; bottom: number; left: number } | null
}) {
  const { mounted, closing } = useExit(open)
  // Cropping is a clip, so nothing inside moves. It starts from "no crop" so the shrink animates, and lingers on release so the growth does.
  const [clipping, setClipping] = useState(false)
  const [live, setLive] = useState<typeof crop>(null)
  useEffect(() => {
    if (crop) {
      setClipping(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setLive(crop)))
      return () => cancelAnimationFrame(id)
    }
    setLive(null)
    const t = window.setTimeout(() => setClipping(false), 420)
    return () => window.clearTimeout(t)
  }, [crop])
  const peek = !!crop || clipping
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  if (!mounted) return null
  return (
    <div
      className={`fixed inset-0 z-[120] grid place-items-center px-4 py-3 transition-[opacity,padding,background-color,backdrop-filter] duration-200 ease-out ${peek ? 'bg-transparent' : 'bg-ink/15 backdrop-blur-[3px]'} ${closing ? 'opacity-0' : 'opacity-100'}`}
      style={{ paddingBottom: 'calc(var(--kb, 0px) + 0.75rem)' }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`glass glass-strong w-full ${wide ? 'max-w-md' : 'max-w-sm'} max-h-full rounded-[2rem] ${footer ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-5'} ${closing ? 'pop-out' : 'pop-in'}`}
        style={clipping ? { clipPath: live ? `inset(${live.top}px ${live.right}px ${live.bottom}px ${live.left}px round 1.25rem)` : 'inset(0px 0px 0px 0px round 2rem)', transition: 'clip-path 0.4s cubic-bezier(0.34, 1.2, 0.5, 1)' } : undefined}
      >
        {footer ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-5">{children}</div>
            <div className="shrink-0 border-t border-white/60 px-5 py-3">{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export function DialogHost() {
  const { spec, open } = useDialog()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) window.setTimeout(() => ref.current?.focus(), 60)
  }, [open])
  if (!spec) return null
  return (
    <Modal open={open} onClose={() => close(false)} label={spec.title}>
      <h3 className="font-display text-xl">{spec.title}</h3>
      {spec.message && <p className="mt-1.5 text-sm text-ink-soft">{spec.message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={() => close(false)} className="rounded-full px-4 py-2 text-sm text-ink-soft transition hover:bg-white/70">
          {spec.cancelLabel ?? 'Keep it'}
        </button>
        <button
          ref={ref}
          onClick={() => close(true)}
          className={`rounded-full px-5 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-105 ${
            spec.danger ? 'bg-[#c4577e] shadow-[#c4577e]/30' : 'bg-lilac-500 shadow-lilac-500/30'
          }`}
        >
          {spec.confirmLabel ?? 'OK'}
        </button>
      </div>
    </Modal>
  )
}
