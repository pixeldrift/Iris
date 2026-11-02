import { useCallback, useEffect, useRef, useState } from 'react'
import { breakMessage, isLocked, lock, PLAY_MS, WARN_MS } from '../../core/playlimit'
import { useStore } from '../../state/store'
import type { PopMode } from './types'
import type { Phase } from './usePopGame'

/**
 * Keeps play (fun mode and the pop game) to three minutes at a time. In fun mode a ten second warning counts down before it
 * ends; in the game the current game is played out to its natural end. Then a kind message, and a break that gets longer each
 * time. Deleting is never limited. The state is kept on the device, so closing the page does not start it over.
 */
export function usePlayLimit({ mode, gamePhase, onStop }: { mode: PopMode; gamePhase: Phase; onStop: () => void }) {
  const limit = useStore((s) => s.settings.limitPlay)
  const gate = useStore((s) => s.settings.playGate)
  const setGate = useStore((s) => s.setPlayGate)
  const [warn, setWarn] = useState<number | null>(null)
  const [lastGame, setLastGame] = useState(false)
  const [note, setNote] = useState<{ text: string; key: number } | null>(null)
  const used = useRef(0)
  const warnAt = useRef<number | null>(null)
  const noteTimer = useRef(0)
  const playful = mode === 'fun' || mode === 'game'
  const stop = useRef(onStop)
  stop.current = onStop
  const current = () => useStore.getState().settings.playGate

  const showBreak = useCallback((remainingMs: number) => {
    window.clearTimeout(noteTimer.current)
    setNote({ text: breakMessage(remainingMs), key: Date.now() })
    noteTimer.current = window.setTimeout(() => setNote(null), 7600)
  }, [])

  const lockNow = useCallback(() => {
    const now = Date.now()
    if (isLocked(current(), now)) return // (once is enough: never a second message)
    const g = lock(current(), now)
    setGate(g)
    used.current = 0
    warnAt.current = null
    setWarn(null)
    setLastGame(false)
    showBreak(g.lockUntil - now)
  }, [setGate, showBreak])

  // time spent playing counts up; at the limit, a warning (fun) or the end of the game in progress (game)
  useEffect(() => {
    if (!limit || !playful) {
      warnAt.current = null
      setWarn(null)
      setLastGame(false)
      return
    }
    used.current = current().usedMs
    let last = Date.now()
    let saved = last
    const iv = window.setInterval(() => {
      const now = Date.now()
      used.current += now - last
      last = now
      if (now - saved > 5000) {
        saved = now
        setGate({ ...current(), usedMs: used.current })
      }
      if (used.current < PLAY_MS) return
      if (mode === 'game' && (gamePhase === 'show' || gamePhase === 'play')) return void setLastGame(true) // play this one out
      if (warnAt.current === null) warnAt.current = now
      const left = WARN_MS - (now - warnAt.current)
      setWarn(Math.max(0, Math.ceil(left / 1000)))
      if (left <= 0) {
        lockNow()
        stop.current()
      }
    }, 250)
    return () => {
      window.clearInterval(iv)
      if (!isLocked(current(), Date.now())) setGate({ ...current(), usedMs: used.current })
    }
  }, [limit, playful, mode, gamePhase, setGate, lockNow])

  // the last game ended: that is the break
  useEffect(() => {
    if (lastGame && mode === 'game' && gamePhase === 'over') lockNow()
  }, [lastGame, mode, gamePhase, lockNow])

  // leaving play with the allowance spent (switching to delete, say) is also the break
  const wasPlayful = useRef(false)
  useEffect(() => {
    if (wasPlayful.current && !playful && limit && used.current >= PLAY_MS && !isLocked(current(), Date.now())) lockNow()
    wasPlayful.current = playful
  }, [playful, limit, lockNow])

  /** Play is off limits right now: say so (kindly). True when it was. */
  const blocked = useCallback((): boolean => {
    if (!limit) return false
    const g = current()
    const now = Date.now()
    if (!isLocked(g, now)) return false
    showBreak(g.lockUntil - now)
    return true
  }, [limit, showBreak])

  const locked = limit && Date.now() < gate.lockUntil
  return { warn, lastGame, note, blocked, locked, breakText: locked ? breakMessage(gate.lockUntil - Date.now()) : null }
}
