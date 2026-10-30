import { seedData } from '../core/seed'
import * as sound from '../audio/engine'
import type { Settings } from './types'

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export const initial = seedData()

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  sfxDrops: true,
  sfxChimes: true,
  sfxPops: true,
  ambient: false,
  volume: 0.7,
  drift: true,
  sizeByPriority: true,
  showDone: false,
  sortKey: 'flow',
  sortDesc: false,
  pondGroup: 'free',
  sidebarSpace: 0.5,
  timelineLegend: false,
  themeHue: 271,
  priorityScale: 1,
  tooltips: true,
  dateFormat: 'us',
  clockFormat: '12',
}

export const applyAudio = (s: Settings) =>
  sound.setAudioConfig({
    master: s.sound,
    drops: s.sfxDrops,
    chimes: s.sfxChimes,
    pops: s.sfxPops,
    ambient: s.ambient,
    volume: s.volume,
  })

