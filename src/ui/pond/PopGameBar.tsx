import { useState } from 'react'
import { satOf } from '../../core/color'
import { useStore } from '../../state/store'
import type { GameState } from './usePopGame'

/** "score: 40 • round: 3 • best: 70", the numbers in bold (the compact line shown while playing). */
function Line({ items }: { items: [string, number][] }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {items.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span className="mx-1.5 text-ink-faint">•</span>}
          {k}: <b className="font-display text-base font-bold text-lilac-600">{v}</b>
        </span>
      ))}
    </span>
  )
}

const panel = 'glass pointer-events-auto rounded-2xl !bg-white/95'

/**
 * The pop game's panels. Before a game and after it, one popup at the top: the rules, or the results as big purple numbers
 * with their names under them. While playing, along the top left (in line with the mode buttons): the score box, the pattern
 * as bubbles in a row beneath it, and under that whose turn it is.
 */
export function PopGameBar({ game, palette }: { game: { g: GameState; start: (memory?: boolean) => void }; palette: number[] }) {
  const { g } = game
  const best = useStore((s) => s.settings.popStats.best)
  const [memory, setMemory] = useState(false)
  const tooFew = palette.length < 3
  const playing = g.phase === 'show' || g.phase === 'play'

  // the pattern's bubbles look like the real ones (same gradient, outline and glow), at the strongest colour
  const dot = (i: number, c: number, state: 'hidden' | 'seen' | 'done' | 'next') => (
    <span
      key={i}
      aria-hidden
      data-hue={palette[c]}
      className={`block h-6 w-6 rounded-full transition ${state === 'hidden' ? 'bg-ink-faint/25' : 'pad'} ${state === 'next' ? 'scale-125 ring-2 ring-white' : ''} ${state === 'done' ? 'opacity-40' : ''}`}
      style={state === 'hidden' ? undefined : ({ '--h': Math.max(0, palette[c] ?? 285), '--s': satOf(palette[c] ?? 285), '--u': 1 } as React.CSSProperties)}
    />
  )

  if (playing) {
    return (
      <>
        <div data-ui data-game-bar className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-start gap-2" role="status" aria-live="polite">
          {/* the score box is as wide as its words; the pattern box runs the whole width of the pond, below the mode buttons */}
          <div className={`${panel} w-fit px-3 py-1.5 text-xs text-ink-soft`}>
            <Line items={[['score', g.score], ['round', g.round], ['best', Math.max(best, g.score)]]} />
          </div>
          {/* the box is always the full width, however short the pattern is */}
          <div className={`${panel} flex min-h-[2.75rem] w-full flex-wrap items-center gap-1.5 px-3 py-2`} aria-label="The pattern">
            {g.seq.map((c, i) => {
              if (g.phase === 'show') return i < g.progress ? dot(i, c, 'seen') : dot(i, c, 'hidden')
              if (g.memory) return dot(i, c, i < g.progress ? 'done' : 'hidden')
              return dot(i, c, i < g.progress ? 'done' : i === g.progress ? 'next' : 'seen')
            })}
          </div>
          <span className="sr-only">{g.phase === 'show' ? 'Watch' : 'Your turn'}</span>
        </div>
        {/* when it becomes your turn: a soft word in the middle of the water, over the bubbles, that fades away */}
        {g.phase === 'play' && (
          <p key={g.round} aria-hidden className="your-turn pointer-events-none absolute inset-0 z-10 grid place-items-center font-display text-4xl italic text-lilac-700/70">
            Your turn
          </p>
        )}
      </>
    )
  }

  return (
    <div data-ui className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4">
      <div className={`${panel} flex w-fit max-w-[min(100%,24rem)] flex-col items-center gap-4 px-6 py-4 text-center`} role="status" aria-live="polite">
        <div className="font-display text-xl leading-tight">{g.phase === 'over' ? 'Game over!' : 'Pop game'}</div>
        {g.phase === 'over' ? (
          <div className="flex items-start justify-center gap-7">
            {(
              [
                ['score', g.score],
                ['round', g.round],
                ['best', Math.max(best, g.score)],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="font-display text-4xl leading-none text-lilac-600 tabular-nums">{v}</div>
                <div className="mt-1 text-xs text-ink-soft">{k}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-soft">{tooFew ? 'Needs bubbles in at least three colours (groups). Add a few and come back.' : 'Watch the colours light up, then pop them in the same order.'}</p>
        )}
        {!tooFew && (
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft">
              <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} aria-label="Memory mode" />
              Memory mode <span className="text-ink-faint">(2x points)</span>
            </label>
            <button onClick={() => game.start(memory)} className="whitespace-nowrap rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
              Play
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
