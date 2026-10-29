import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FlowerGallery } from './ui/FlowerGallery'
import './index.css'
import './ui/theme'
import './state/prefs'
import './ui/tooltips'
import './ui/keyboard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.hash === '#flowers' ? <FlowerGallery /> : <App />}</StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// The on-screen keyboard overlays the frame (it never resizes it). Publish its height as --kb so sheets and
// dialogs can glide up above it.
const vv = window.visualViewport
const syncKeyboard = () => {
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
  document.documentElement.style.setProperty('--kb', `${Math.round(kb > 80 ? kb : 0)}px`)
}
vv?.addEventListener('resize', syncKeyboard)
vv?.addEventListener('scroll', syncKeyboard)
syncKeyboard()

// iOS pans the page up to reveal a focused field: put the frame straight back.
window.visualViewport?.addEventListener('scroll', () => window.scrollTo(0, 0))
window.addEventListener('scroll', () => window.scrollTo(0, 0), { passive: true })
