import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { seedOnce } from './lib/db.ts'

registerSW({ immediate: true })
navigator.storage?.persist?.()
// lets :active fire instantly on Android touch
document.addEventListener('touchstart', () => {}, { passive: true })

seedOnce().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
