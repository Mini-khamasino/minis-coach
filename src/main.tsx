import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/install.ts' // first: catches the browser's install event before React mounts
import './index.css'
import App from './App.tsx'
import { installSyncHooks } from './lib/syncCore.ts'
import { DEMO } from './lib/db.ts'

navigator.storage?.persist?.()
// lets :active fire instantly on Android touch
document.addEventListener('touchstart', () => {}, { passive: true })

installSyncHooks()
const render = () => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
// test mode fills its sandbox with sample data before the first screen
if (DEMO) import('./lib/demo.ts').then((d) => d.seedDemo()).finally(render)
else render()
