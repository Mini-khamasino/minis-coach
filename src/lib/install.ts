// Install support. Android/desktop Chrome give us a real install dialog (beforeinstallprompt);
// iOS has no API for it, so there we can only guide the person through Share → Add to Home Screen.
import { useSyncExternalStore } from 'react'

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

// registered at import time (main.tsx imports this first) so the early event isn't missed
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify() })
addEventListener('appinstalled', () => { deferred = null; notify() })

export const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** 'prompt' = we can show the system dialog, 'ios' = show the guide, null = already installed / not possible */
export function useInstall(): 'prompt' | 'ios' | null {
  const canPrompt = useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => !!deferred)
  if (isInstalled()) return null
  return canPrompt ? 'prompt' : isIos ? 'ios' : null
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}
