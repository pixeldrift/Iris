import { useState } from 'react'
import { tint } from '../../core/color'
import { useStore } from '../../state/store'
import type { GameState } from './usePopGame'

/** The pop game's panel at the top of the pond: the pattern as coloured dots, the round and the score, start and play again. */
export function PopGameBar({ game, palette }: { game: { g: GameState; start: (memory?: boolean) => void }; palette: number[] }) {
  const { g } = game
  const best = useStore((s) => s.settings.popStats.best)
  const [memory, setMemory] = useState(false)
  const tooFew = palette.length < 3
  const dot = (i: number, c: number, state: 'hidden' | 'seen' | 'done' | 'next') => (
    <span
      key={i}
      aria-hidden
      data-hue={palette[c]}
      className={`h-4 w-4 rounded-full transition ${state === 'hidden' ? 'bg-ink-faint/25' : ''} ${state === 'next' ? 'ring-2 ring-white scale-125' : ''} ${state === 'done' ? 'opacity-40' : ''}`}
      style={state === 'hidden' ? undefined : { background: tint(palette[c] ?? 285, 70, 62) }}
    />
  )
  return (
    <div data-ui className="pointer-events-none absolute inset-x-0 top-[3.75rem] z-10 flex justify-center px-4">
      <div className="glass pointer-events-auto flex max-w-full flex-col items-center gap-1.5 rounded-2xl px-4 py-2 text-center" role="status" aria-live="polite">
        {g.phase === 'idle' || g.phase === 'over' ? (
          <>
            <div className="font-display text-lg leading-tight">{g.phase === 'over' ? 'Game over' : 'Pop game'}</div>
            <p className="text-xs text-ink-soft">
              {g.phase === 'over'
                ? `Score ${g.score} · reached round ${g.round} · best ${Math.max(best, g.score)}`
                : tooFew
                  ? 'Needs bubbles in at least three colours (groups). Add a few and come back.'
                  : 'Watch the colours light up, then pop them in the same order. Each round adds one, and it speeds up.'}
            </p>
            {!tooFew && (
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
                  <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} aria-label="Memory mode" />
                  Memory mode <span className="text-ink-faint">(pattern hidden, double points)</span>
                </label>
                <button onClick={() => game.start(memory)} className="rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
                  {g.phase === 'over' ? 'Play again' : 'Start'}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 text-xs text-ink-soft tabular-nums">
              <span>Round {g.round}</span>
              <span className="font-medium text-lilac-700">{g.score} pts</span>
              <span>Best {Math.max(best, g.score)}</span>
              <span className="text-ink-faint">{g.phase === 'show' ? 'Watch…' : 'Your turn'}</span>
            </div>
            <div className="flex min-h-[1.25rem] items-center justify-center gap-1.5" aria-label="The pattern">
              {g.seq.map((c, i) => {
                if (g.phase === 'show') return i < g.progress ? dot(i, c, 'seen') : dot(i, c, 'hidden')
                if (g.memory) return dot(i, c, i < g.progress ? 'done' : 'hidden')
                return dot(i, c, i < g.progress ? 'done' : i === g.progress ? 'next' : 'seen')
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
