// Procedural audio: no samples to ship. Water drops, completion chimes and a
// slow generative wind-chime bed, all through one shared reverb.

let ctx: AudioContext | null = null
let master: GainNode
let reverbIn: GainNode
let echoIn: GainNode
let windGain: GainNode | null = null
let ambientTimer: number | null = null
let fxOn = true
let ambientOn = false

// D major pentatonic over three octaves: anything sounds consonant.
const SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.5]

function impulse(c: AudioContext, seconds = 3.2): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  return buf
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.7
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp).connect(ctx.destination)

    const conv = ctx.createConvolver()
    conv.buffer = impulse(ctx)
    reverbIn = ctx.createGain()
    reverbIn.gain.value = 0.55
    reverbIn.connect(conv).connect(master)

    // soft ping-pong-ish echo for the water drop
    echoIn = ctx.createGain()
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.26
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    echoIn.connect(delay)
    delay.connect(lp).connect(fb).connect(delay)
    lp.connect(master)
    lp.connect(reverbIn)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function unlock() {
  ensure()
}

export function setFx(on: boolean) {
  fxOn = on
}

/** A soft water droplet with an echo. `pan` -1..1. */
export function drop(pan = 0) {
  if (!fxOn) return
  const c = ensure()
  if (!c) return
  const t = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  const p = c.createStereoPanner()
  p.pan.value = pan
  const f0 = 620 + Math.random() * 160
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f0 * 1.9, t)
  osc.frequency.exponentialRampToValueAtTime(f0, t + 0.09)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.28, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
  osc.connect(g).connect(p)
  p.connect(master)
  p.connect(echoIn)
  p.connect(reverbIn)
  osc.start(t)
  osc.stop(t + 0.45)
}

function bell(freq: number, when: number, vol: number, pan: number, decay: number) {
  const c = ctx!
  const p = c.createStereoPanner()
  p.pan.value = pan
  p.connect(master)
  p.connect(reverbIn)
  // slightly inharmonic partials = glassy chime
  for (const [ratio, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = freq * ratio
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(vol * amp, when + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay / ratio)
    o.connect(g).connect(p)
    o.start(when)
    o.stop(when + decay + 0.1)
  }
}

export function chime(index?: number, vol = 0.09) {
  if (!fxOn && !ambientOn) return
  const c = ensure()
  if (!c) return
  const f = SCALE[(index ?? Math.floor(Math.random() * SCALE.length)) % SCALE.length]
  bell(f, c.currentTime, vol, Math.random() * 1.2 - 0.6, 4.5)
}

/** Rising two-note sparkle when a task blooms. */
export function bloom() {
  if (!fxOn) return
  const c = ensure()
  if (!c) return
  const i = 4 + Math.floor(Math.random() * 3)
  bell(SCALE[i], c.currentTime, 0.1, -0.2, 3)
  bell(SCALE[i + 2], c.currentTime + 0.11, 0.09, 0.2, 3.5)
  bell(SCALE[i + 4 > 11 ? 11 : i + 4], c.currentTime + 0.24, 0.07, 0, 4)
}

/** Tiny tick for dropping into a folder. */
export function plink() {
  if (!fxOn) return
  const c = ensure()
  if (!c) return
  bell(SCALE[5 + Math.floor(Math.random() * 3)], c.currentTime, 0.08, 0, 1.6)
}

function startWind() {
  const c = ctx!
  if (windGain) return
  const len = c.sampleRate * 4
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02 // brown-ish noise
    d[i] = last * 3.5
  }
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 500
  bp.Q.value = 0.6
  windGain = c.createGain()
  windGain.gain.value = 0
  windGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 4)
  // slow swell
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = c.createGain()
  lfoGain.gain.value = 250
  lfo.connect(lfoGain).connect(bp.frequency)
  const lfo2 = c.createOscillator()
  lfo2.frequency.value = 0.045
  const lfo2Gain = c.createGain()
  lfo2Gain.gain.value = 0.025
  lfo2.connect(lfo2Gain).connect(windGain.gain)
  src.connect(bp).connect(windGain).connect(master)
  src.start()
  lfo.start()
  lfo2.start()
}

function scheduleNext() {
  if (!ambientOn) return
  const gap = 1800 + Math.random() * 5200
  ambientTimer = window.setTimeout(() => {
    if (!ctx || !ambientOn) return
    const c = ctx
    // sometimes a gust: a little cascade of notes
    const gust = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 3) : 1
    let idx = Math.floor(Math.random() * SCALE.length)
    for (let i = 0; i < gust; i++) {
      idx = Math.max(0, Math.min(SCALE.length - 1, idx + Math.floor(Math.random() * 5) - 2))
      bell(SCALE[idx], c.currentTime + i * (0.12 + Math.random() * 0.25), 0.045 + Math.random() * 0.03, Math.random() * 1.6 - 0.8, 5)
    }
    scheduleNext()
  }, gap)
}

export function setAmbient(on: boolean) {
  ambientOn = on
  if (on) {
    if (!ensure()) return
    startWind()
    if (windGain) windGain.gain.setTargetAtTime(0.05, ctx!.currentTime, 1.5)
    if (ambientTimer === null) scheduleNext()
    else {
      window.clearTimeout(ambientTimer)
      scheduleNext()
    }
  } else {
    if (ambientTimer !== null) window.clearTimeout(ambientTimer)
    ambientTimer = null
    if (windGain && ctx) windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.6)
  }
}
