import { setLocalePrefs, type ClockStyle, type DateStyle } from '../core/locale'
import { setAutoUrgency } from '../core/tasks'
import { useStore } from './store'

// keeps the pure formatting code in step with the user's date and clock choices
const sync = () => {
  const s = useStore.getState().settings
  setLocalePrefs({ date: s.dateFormat as DateStyle, clock: s.clockFormat as ClockStyle })
  setAutoUrgency(s.autoUrgency)
}
sync()
useStore.subscribe(sync)
