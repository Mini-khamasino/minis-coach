import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { db } from './db.ts'
import { auth, fs, googleProvider } from './firebase.ts'

// Dexie stays the source of truth (offline, instant); Firestore mirrors it per user at coachUsers/{uid}/{table}/{key}.
let uid: string | null = null
let muted = false // true while writing cloud data into Dexie, so it isn't echoed back

const keyPath = (t: string) => db.table(t).schema.primKey.keyPath as string
const ref = (t: string, key: unknown) => doc(fs, 'coachUsers', uid!, t, encodeURIComponent(String(key)))
// old installs still carry the removed Gemini key in settings; never upload it
const clean = (t: string, obj: Record<string, unknown>) =>
  t === 'kv' && obj.key === 'settings' ? { ...obj, value: { ...(obj.value as object), apiKey: undefined, model: undefined } } : obj

const push = (t: string, key: unknown, obj: object) =>
  setDoc(ref(t, key), clean(t, { ...obj, [keyPath(t)]: key } as Record<string, unknown>)).catch((e) => console.warn('sync', e))

export function installSyncHooks() {
  for (const table of db.tables) {
    const t = table.name
    table.hook('creating', function (_pk, obj) { if (uid && !muted) this.onsuccess = (key) => push(t, key, obj) })
    table.hook('updating', function (_mods, key) { if (uid && !muted) this.onsuccess = (updated) => push(t, key, updated) })
    table.hook('deleting', function (key) { if (uid && !muted) this.onsuccess = () => deleteDoc(ref(t, key)).catch((e) => console.warn('sync', e)) })
  }
}

async function uploadAll() {
  for (const table of db.tables) {
    const rows = await table.toArray()
    for (let i = 0; i < rows.length; i += 400) {
      const batch = writeBatch(fs)
      for (const r of rows.slice(i, i + 400)) batch.set(ref(table.name, (r as Record<string, unknown>)[keyPath(table.name)]), clean(table.name, r))
      await batch.commit()
    }
  }
}

async function downloadAll() {
  const data = await Promise.all(db.tables.map(async (t) => [t, (await getDocs(collection(fs, 'coachUsers', uid!, t.name))).docs.map((d) => d.data())] as const))
  muted = true
  try {
    await db.transaction('rw', db.tables, async () => {
      for (const [t, rows] of data) if (rows.length) await t.bulkPut(rows)
    })
    const s = await db.kv.get('settings')
    if (s) await db.kv.put({ key: 'settings', value: { ...(s.value as object), onboarded: true } })
  } finally {
    muted = false
  }
}

const hasLocalData = async () => (await db.items.count()) + (await db.weights.count()) > 0

/** First sign-in on a phone: an empty cloud gets this phone's data; an empty phone gets the cloud's. */
async function reconcile(user: User) {
  uid = user.uid
  const meta = doc(fs, 'coachUsers', uid)
  const snap = await getDoc(meta)
  if (!snap.exists()) {
    await uploadAll()
    await setDoc(meta, { createdAt: Date.now(), name: user.displayName ?? '', email: user.email ?? '' })
  } else if (!(await hasLocalData())) {
    await downloadAll()
  }
  // shortcut: both sides have data → keep this phone's copy and sync forward (no merge); fine while it's one person per phone
}

export type SyncState = { user: User | null; status: 'idle' | 'syncing' | 'synced' | 'error' }

export function useSync(): SyncState {
  const [state, setState] = useState<SyncState>({ user: auth.currentUser, status: 'idle' })
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (!user) { uid = null; return setState({ user: null, status: 'idle' }) }
        setState({ user, status: 'syncing' })
        reconcile(user).then(
          () => setState({ user, status: 'synced' }),
          (e) => { console.warn('sync', e); setState({ user, status: 'error' }) },
        )
      }),
    [],
  )
  return state
}

const isIosStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

export const signIn = () => (isIosStandalone() ? signInWithRedirect(auth, googleProvider) : signInWithPopup(auth, googleProvider))
export const logOut = () => signOut(auth)
