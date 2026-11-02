import { useCallback, useEffect, useRef, useState } from 'react'
import * as sound from '../../audio/engine'
import { firstColour, planRound, POP_POINTS, roundPoints, stepMs } from '../../core/popgame'
import { useStore } from '../../state/store'

export type Phase = 'idle' | 'show' | 'play' | 'over'

export interface GameState {
  phase: Phase
  /** the colours of the pattern, as indices into the palette */
  seq: number[]
  /** how many of the pattern have been lit so far (during "show") or popped right (during "play") */
  progress: number
  /** the colour lit up right now */
  lit: number | null
  round: number
  score: number
  /** the pattern is hidden while you play it back: harder, and worth double */
  memory: boolean
}

const START: GameState = { phase: 'idle', seq: [], progress: 0, lit: null, round: 0, score: 0, memory: false }

/**
 * Simon with bubbles. Each round adds one colour to the pattern, lights it up, then waits for you to pop that colour
 * order back (any bubble of the colour will do). Quicker every round; a wrong pop ends the game.
 */
/** What the game asks of the field of bubbles: how many there are of each colour, and to add more of given colours. */
export interface GameField {
  counts: () => number[]
  add: (colours: number[]) => void
}

export function usePopGame(colours: number, field: GameField) {
  const [g, setG] = useState<GameState>(START)
  const ref = useRef(g)
  ref.current = g
  const timers = useRef<number[]>([])
  const playStart = useRef(0)
  const addStats = useStore((s) => s.addPopStats)
  const fieldRef = useRef(field)
  fieldRef.current = field

  const clear = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => void timers.current.push(window.setTimeout(fn, ms))
  const set = (p: Partial<GameState>) => setG((s) => ({ ...s, ...p }))

  const show = useCallback((seq: number[], round: number) => {
    const step = stepMs(round)
    set({ phase: 'show', seq, round, progress: 0, lit: null })
    seq.forEach((c, i) => {
      later(() => {
        sound.blip(c)
        set({ lit: c, progress: i + 1 })
      }, 650 + i * step)
      later(() => set({ lit: null }), 650 + i * step + step * 0.72)
    })
    later(() => {
      playStart.current = Date.now()
      set({ phase: 'play', progress: 0, lit: null })
    }, 650 + seq.length * step + 150)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(
    (memory = false) => {
      clear()
      if (colours < 2) return
      setG({ ...START, memory, score: 0 })
      // the pattern only ever asks for colours there is a bubble for
      let first = firstColour(fieldRef.current.counts())
      if (first === null) {
        const add = Array.from({ length: 6 }, () => Math.floor(Math.random() * colours))
        fieldRef.current.add(add)
        first = add[0]
      }
      show([first], 1)
    },
    [colours, show],
  )

  const stop = useCallback(() => {
    clear()
    const s = ref.current
    // stopping partway still banks what was won so far
    if ((s.phase === 'play' || s.phase === 'show') && s.score > 0) addStats({ points: s.score, best: s.score, games: 1 })
    setG(START)
  }, [addStats])

  const tap = useCallback(
    (c: number) => {
      const s = ref.current
      if (s.phase !== 'play') return
      sound.blip(c)
      if (c !== s.seq[s.progress]) {
        sound.buzz()
        clear()
        addStats({ points: s.score, best: s.score, games: 1 })
        set({ phase: 'over' })
        return
      }
      const progress = s.progress + 1
      let score = s.score + POP_POINTS * (s.memory ? 2 : 1)
      if (progress < s.seq.length) return set({ progress, score })
      // the whole pattern, right: bonus, then one more colour and a faster pace
      score += roundPoints(s.round, Date.now() - playStart.current, s.memory)
      set({ progress, score, phase: 'show', lit: null })
      // new bubbles replace the ones just popped, and the next colour is one the field can supply
      const plan = planRound(s.seq, fieldRef.current.counts(), s.seq.length)
      fieldRef.current.add(plan.add)
      later(() => show([...s.seq, plan.next], s.round + 1), 900 + plan.add.length * 110)
    },
    [colours, show, addStats],
  )

  // leaving the game partway counts what was won so far
  useEffect(
    () => () => {
      clear()
      const s = ref.current
      if ((s.phase === 'play' || s.phase === 'show') && s.score > 0) useStore.getState().addPopStats({ points: s.score, best: s.score, games: 1 })
    },
    [],
  )

  return { g, start, stop, tap }
}
