/**
 * Shared constants for the pond's water: the shader draws the wave front at
 * `speed`, and the bubbles bob when the same front reaches them.
 */
export const WATER = {
  /** Wave front speed, CSS px per second. */
  speed: 112,
  /** Seconds before a ripple has fully faded. */
  life: 8,
  /** Ripples alive at once (the shader's fixed array size). */
  max: 4,
}
