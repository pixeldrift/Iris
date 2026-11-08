/** The small dot under a slider where its default sits: tap it to put the slider back (the app's convention for Look & Feel sliders). */
export function DefaultDot({ at, onReset, color, label }: { at: number; onReset: () => void; color: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label={label}
      title={label}
      className="absolute bottom-[-0.15rem] z-20 grid h-3.5 w-3.5 -translate-x-1/2 place-items-center"
      style={{ left: `calc(0.55rem + (100% - 1.1rem) * ${at})` }}
    >
      <span className="block h-1.5 w-1.5 rounded-full transition-transform hover:scale-150" style={{ background: color }} />
    </button>
  )
}
