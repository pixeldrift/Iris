/** Limiting play: three minutes at a time, then a break that grows longer each time it is needed (and starts over after a quiet spell). */

export interface PlayGate {
  /** play used up in the current allowance (ms) */
  usedMs: number
  /** play is not allowed again until then (epoch ms; 0 = not locked) */
  lockUntil: number
  /** how many breaks in a row (picks how long the next one is) */
  level: number
  /** when the last break began */
  lastLockAt: number
}

export const EMPTY_GATE: PlayGate = { usedMs: 0, lockUntil: 0, level: 0, lastLockAt: 0 }
export const PLAY_MS = 3 * 60_000
/** The warning before play stops, in fun mode */
export const WARN_MS = 10_000
/** Break lengths in minutes: three, then five, ten, fifteen, and never more than thirty. */
export const COOLDOWNS_MIN = [3, 5, 10, 15, 30]
/** After this long without needing a break the next one is the shortest again. */
export const FORGET_MS = 3 * 3_600_000

export const cooldownMs = (level: number): number => COOLDOWNS_MIN[Math.min(Math.max(0, level), COOLDOWNS_MIN.length - 1)] * 60_000

export const isLocked = (g: PlayGate, now: number): boolean => now < g.lockUntil

/** Which break comes next: the first again if the last one was long ago. */
export const levelNow = (g: PlayGate, now: number): number => (g.lastLockAt && now - g.lastLockAt > FORGET_MS ? 0 : g.level)

/** The gate after the allowance has run out at `now`. */
export function lock(g: PlayGate, now: number): PlayGate {
  const level = levelNow(g, now)
  return { usedMs: 0, lockUntil: now + cooldownMs(level), level: level + 1, lastLockAt: now }
}

/** "That was a fun little break! Let's give it another five minutes until the next one." (the minutes are what is left of the break) */
export function breakMessage(remainingMs: number): string {
  const n = Math.max(1, Math.ceil(remainingMs / 60_000))
  return `That was a fun little break! Let’s give it another ${n} ${n === 1 ? 'minute' : 'minutes'} until the next one.`
}
