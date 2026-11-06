// Audio. The interface sounds (adding, finishing, tagging, deleting, a reminder) are short recorded samples from
// public/sounds, deliberately nothing bell-like so they never blend into the ambient bed. The ambient bed itself
// (wind and wind chimes) is generated, through a shared reverb.

let ctx: AudioContext | null = null
let master: GainNode
let reverbIn: GainNode
let windGain: GainNode | null = null
let ambientTimer: number | null = null
export interface AudioConfig {
  master: boolean
  drops: boolean
  chimes: boolean
  pops: boolean
  ambient: boolean
  volume: number
}
let cfg: AudioConfig = { master: true, drops: true, chimes: true, pops: true, ambient: false, volume: 0.7 }
let ambientOn = false

/**
 * The interface sounds: which recording, and how much to lift or lower it (the files were recorded at very different levels).
 * Change a sound here to swap it.
 */
const SOUNDS = {
  add: { url: '/sounds/drop-wet.wav', gain: 3.4 }, // a new item: a water drop
  arrive: { url: '/sounds/bubbles-wet.wav', gain: 1.4 }, // an item arriving from another device
  pop: { url: '/sounds/pop-high.wav', gain: 2.2 }, // a bubble deleted
  done: { url: '/sounds/drip-double.wav', gain: 0.5 }, // checking an item off, and nothing else
  undone: { url: '/sounds/drip-down.wav', gain: 0.5 }, // un-checking it: the same two drips, in the opposite order
  tick: { url: '/sounds/pop-low.wav', gain: 0.9 }, // tagged, moved, dropped into a group
  alert: { url: '/sounds/bubble-trio.wav', gain: 5 }, // a reminder going off
  notify: { url: '/sounds/notify.wav', gain: 1.6 }, // news for you: a task given to you, an invitation (a soft rising pair of notes)
} as const
type SoundKey = keyof typeof SOUNDS
const buffers = new Map<string, AudioBuffer>()
let loading = false

/** Fetch and decode every recording once (called when the audio context first exists). Until a sound has loaded it is silent. */
function loadSounds(c: AudioContext) {
  if (loading) return
  loading = true
  for (const url of new Set(Object.values(SOUNDS).map((v) => v.url))) {
    void fetch(url)
      .then((r) => r.arrayBuffer())
      // (the callback form: older Safari has no promise version)
      .then((data) => new Promise<AudioBuffer>((ok, bad) => c.decodeAudioData(data, ok, bad)))
      .then((b) => void buffers.set(url, b))
      .catch(() => {
        loading = false // try again next time
      })
  }
}

/** Play one of the recordings, dry (no reverb). A little variation in speed keeps repeats from sounding mechanical. */
function play(key: SoundKey, { rate = 1, variation = 0.06, pan = 0, level = 1 }: { rate?: number; variation?: number; pan?: number; level?: number } = {}) {
  const c = ensure()
  if (!c) return
  const buf = buffers.get(SOUNDS[key].url)
  if (!buf) return
  const src = c.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * variation)
  const g = c.createGain()
  g.gain.value = SOUNDS[key].gain * level
  const p = c.createStereoPanner()
  p.pan.value = pan
  src.connect(g).connect(p).connect(master)
  src.start()
}

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

function ensure(awake = false): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = cfg.volume
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp).connect(ctx.destination)

    const conv = ctx.createConvolver()
    conv.buffer = impulse(ctx)
    reverbIn = ctx.createGain()
    reverbIn.gain.value = 0.55
    reverbIn.connect(conv).connect(master)
    loadSounds(ctx)
  }
  // iOS also leaves a context 'interrupted' after a call, the lock screen or a trip to another app
  if ((awake || !hidden()) && (ctx.state as string) !== 'running') void ctx.resume().catch(() => {})
  return ctx
}

/**
 * A reminder going off. Unlike the other sounds this plays even when the app is out of sight (a different tab or app),
 * for as long as the browser lets the page run; then the engine goes back to sleep. It still follows the master sound switch.
 */
export function alertSound() {
  if (!cfg.master) return
  const c = ensure(true)
  if (!c) return
  play('alert', { variation: 0.02 })
  if (hidden()) window.setTimeout(() => hidden() && pauseAudio(), 5000)
}

/** Is sound actually able to play right now? (Browsers keep it suspended until a tap.) */
export const audioRunning = () => !!ctx && ctx.state === 'running'

/** Bring audio back after the app was backgrounded or interrupted. */
export function resumeAudio() {
  if (!activated || hidden()) return
  ensure()
  if (ambientOn && ambientTimer === null) scheduleNext()
}

// ---- good manners on a phone ----
// 'ambient' lets this app's sounds mix with whatever else is playing (music, a podcast) instead of pausing it,
// and it follows the ring switch like any other app sound.
function applySession() {
  if (typeof navigator === 'undefined') return
  try {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (s) s.type = 'ambient'
  } catch {
    /* not supported */
  }
}

/** Nothing plays while the app is out of sight: the sound engine is put to sleep and wakes when it is back. */
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export function pauseAudio() {
  if (ambientTimer !== null) window.clearTimeout(ambientTimer)
  ambientTimer = null
  if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {})
}

let activated = false

/** Call from a user gesture; starts ambient if the settings ask for it. */
export function unlock() {
  activated = true
  const c = ensure()
  applySession()
  if (c) {
    // a silent blip inside the tap is what fully wakes iOS audio
    const s = c.createBufferSource()
    s.buffer = c.createBuffer(1, 1, 22050)
    s.connect(c.destination)
    s.start(0)
  }
  setAmbient(cfg.master && cfg.ambient)
}

const can = (k: 'drops' | 'chimes' | 'pops') => cfg.master && cfg[k] && !hidden()

/** Apply the user's sound settings. Ambient only runs once audio is unlocked. */
export function setAudioConfig(c: AudioConfig) {
  cfg = c
  if (ctx) master.gain.setTargetAtTime(c.volume, ctx.currentTime, 0.05)
  if (activated) {
    applySession()
    setAmbient(c.master && c.ambient)
  }
}

/** A new item is added. `pan` -1..1. */
export function drop(pan = 0) {
  if (!can('drops')) return
  play('add', { pan })
}

/** An item arrives from another device. */
export function arrive(pan = 0) {
  if (!can('drops')) return
  play('arrive', { pan })
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

/** Finished. */
export function bloom() {
  if (!can('chimes')) return
  play('done', { variation: 0.03 })
}

/** Something for you in the bell (a task given to you, an invitation to share). Quiet in the background, like the other interface sounds. */
export function notify() {
  if (!can('chimes')) return
  play('notify', { variation: 0.01 })
}

/** Un-checked: the two drips of finishing, played the other way round (it falls instead of rises). */
export function undone() {
  if (!can('chimes')) return
  play('undone', { variation: 0.03 })
}

/** A bubble is deleted. */
export function pop() {
  if (!can('pops')) return
  play('pop')
}

/** A soft note for the pop game: each colour has its own, so a pattern can be heard as well as seen. */
export function blip(i: number) {
  if (!can('pops')) return
  const c = ensure()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.value = SCALE[(i * 2) % SCALE.length] * 1.5
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.28, c.currentTime + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35)
  o.connect(g).connect(master)
  g.connect(reverbIn)
  o.start()
  o.stop(c.currentTime + 0.4)
}

/** A new spare bubble floating up: a soft, short rising bloop, much quieter than a pop (and not any of the recordings). */
export function spawn() {
  if (!can('pops')) return
  const c = ensure()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  const f = 330 + Math.random() * 120
  o.frequency.setValueAtTime(f, c.currentTime)
  o.frequency.exponentialRampToValueAtTime(f * 1.7, c.currentTime + 0.11)
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 0.025)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2)
  o.connect(g).connect(master)
  g.connect(reverbIn)
  o.start()
  o.stop(c.currentTime + 0.25)
}

/** A wrong answer in the pop game: low and short. */
export function buzz() {
  if (!can('pops')) return
  play('pop', { rate: 0.55, variation: 0 })
}

/** Tagging, moving, dropping into a group. */
export function plink() {
  if (!can('chimes')) return
  play('tick')
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
  if (!ambientOn || hidden()) return
  const gap = 1800 + Math.random() * 5200
  ambientTimer = window.setTimeout(() => {
    if (!ctx || !ambientOn || hidden()) return
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
    else return
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
