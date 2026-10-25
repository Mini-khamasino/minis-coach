// The light half of cloud sync: always loaded, no Firebase code. It records every Dexie change and hands it to
// the heavy half (sync.ts, loaded after first paint) once that knows who is signed in.
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { db, DEMO, ADMIN_EMAIL } from './db.ts'
import { L } from './i18n.ts'

export type Op = { t: string; key: unknown; obj?: object } // no obj = delete
export type SyncState = { user: User | null; status: 'idle' | 'syncing' | 'synced' | 'error' }
export type Flags = {
  ai: boolean
  feedback: boolean
  library: boolean
  routines: boolean
  aiV2: boolean
}

const LOCAL_ONLY_TABLES = new Set(['reports', 'feedbackQueue'])

let queue: Op[] = []
let send: ((op: Op) => void) | null = null
let muted = false

export const setMuted = (m: boolean) => { muted = m }

/** sync.ts calls this when a user is signed in (flushes changes made meanwhile) or signed out (drops them). */
export function setSender(fn: ((op: Op) => void) | null) {
  send = fn
  if (fn) queue.forEach(fn)
  queue = []
}

function emit(op: Op) {
  if (muted) return
  if (send) send(op)
  else if (queue.length < 5000) queue.push(op)
}

export function installSyncHooks() {
  if (DEMO) return // sandbox data never syncs
  for (const table of db.tables) {
    const t = table.name
    if (LOCAL_ONLY_TABLES.has(t)) continue
    table.hook('creating', function (_pk, obj) { this.onsuccess = (key) => emit({ t, key, obj }) })
    table.hook('updating', function (_mods, key) { this.onsuccess = (updated) => emit({ t, key, obj: updated }) })
    table.hook('deleting', function (key) { this.onsuccess = () => emit({ t, key }) })
  }
}

let mod: Promise<typeof import('./sync.ts')> | null = null
export const loadSync = () => (mod ??= import('./sync.ts'))
let loaded: typeof import('./sync.ts') | null = null
loadSync().then((m) => { loaded = m })

let activeFlags: Flags = { ai: false, feedback: false, library: false, routines: false, aiV2: false }
let activeUser: User | null = null

export function isAiV2(): boolean {
  if (DEMO && activeUser?.email === ADMIN_EMAIL) return true
  return activeFlags.aiV2
}

export function useSync(): SyncState {
  const [state, setState] = useState<SyncState>({ user: null, status: 'idle' })
  useEffect(() => {
    let off: (() => void) | undefined
    let alive = true
    loadSync().then((m) => { if (alive) off = m.watchAuth(setState) })
    return () => { alive = false; off?.() }
  }, [])
  return state
}

// the popup must open inside the tap or the browser blocks it, so never wait for the module here
export const signIn = () => {
  if (!loaded) return Promise.reject(new Error(L('لحظة بيحمّل… جرب تاني', 'Still loading — try again')))
  justSignedIn = true
  return loaded.signIn()
}
// lets the app confirm a sign-in the person just did, without toasting on every launch
let justSignedIn = false
export const takeJustSignedIn = () => { const v = justSignedIn; justSignedIn = false; return v }
export const logOut = () => loadSync().then((m) => m.logOut())
export const pullFromCloud = () => loadSync().then((m) => m.pullFromCloud())
export const backupNow = () => loadSync().then((m) => m.backupNow())
export const setFlag = (name: keyof Flags, on: boolean) => loadSync().then((m) => m.setFlag(name, on))
export const idToken = () => loadSync().then((m) => m.idToken())
export const sendFeedback = (data: { type: 'bug' | 'idea' | 'other'; text: string; doing?: string }) => loadSync().then((m) => m.sendFeedback(data))
export const flushReports = () => loadSync().then((m) => m.flushReports())
export const getFeedback = () => loadSync().then((m) => m.getFeedback())
export const clearFeedback = (ids: string[]) => loadSync().then((m) => m.clearFeedback(ids))
export const summarizeFeedback = (items: unknown[]) => loadSync().then((m) => m.summarizeFeedback(items))

/**
 * Which features this person gets: published ones for everyone; in test mode the admin gets every unreleased feature.
 * Signed-out people get nothing that needs the network (the AI relay requires sign-in anyway).
 */
export function useFeatures(user: User | null): Flags & { admin: boolean } {
  const [flags, setFlags] = useState<Flags>({ ai: false, feedback: false, library: false, routines: false, aiV2: false })
  const uid = user?.uid
  useEffect(() => {
    if (!uid) return setFlags({ ai: false, feedback: false, library: false, routines: false, aiV2: false })
    let off: (() => void) | undefined
    let alive = true
    loadSync().then((m) => { if (alive) off = m.watchFlags(setFlags) })
    return () => { alive = false; off?.() }
  }, [uid])
  useEffect(() => { activeFlags = flags; activeUser = user }, [flags, user])
  const admin = user?.email === ADMIN_EMAIL
  const allForAdmin = DEMO && admin
  return {
    ai: allForAdmin || flags.ai,
    feedback: allForAdmin || flags.feedback,
    library: allForAdmin || flags.library,
    routines: allForAdmin || flags.routines,
    aiV2: allForAdmin || flags.aiV2,
    admin,
  }
}
