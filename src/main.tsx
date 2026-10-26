import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FlowerGallery } from './ui/FlowerGallery'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.hash === '#flowers' ? <FlowerGallery /> : <App />}</StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
