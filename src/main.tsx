import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installSyncHooks } from './lib/sync.ts'

navigator.storage?.persist?.()
// lets :active fire instantly on Android touch
document.addEventListener('touchstart', () => {}, { passive: true })

installSyncHooks()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
