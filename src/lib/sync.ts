// The heavy half of cloud sync (Firebase), loaded after first paint. Dexie stays the source of truth (offline,
// instant); Firestore mirrors it per user at coachUsers/{uid}/{table}/{key}.
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch, query, limit } from 'firebase/firestore'
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { db } from './db.ts'
import { auth, fs, googleProvider } from './firebase.ts'
import { setSender, setMuted, type Op, type SyncState } from './syncCore.ts'

const keyPath = (t: string) => db.table(t).schema.primKey.keyPath as string
const ref = (uid: string, t: string, key: unknown) => doc(fs, 'coachUsers', uid, t, encodeURIComponent(String(key)))
// old installs still carry the removed Gemini key in settings; never upload it
const clean = (t: string, obj: Record<string, unknown>) =>
  t === 'kv' && obj.key === 'settings' ? { ...obj, value: { ...(obj.value as object), apiKey: undefined, model: undefined } } : obj

const sender = (uid: string) => (op: Op) => {
  const r = ref(uid, op.t, op.key)
  ;(op.obj ? setDoc(r, clean(op.t, { ...op.obj, [keyPath(op.t)]: op.key } as Record<string, unknown>)) : deleteDoc(r)).catch((e) => console.warn('sync', e))
}

async function uploadAll(uid: string) {
  for (const table of db.tables) {
    const rows = await table.toArray()
    for (let i = 0; i < rows.length; i += 400) {
      const batch = writeBatch(fs)
      for (const r of rows.slice(i, i + 400)) batch.set(ref(uid, table.name, (r as Record<string, unknown>)[keyPath(table.name)]), clean(table.name, r))
      await batch.commit()
    }
  }
}

async function downloadAll(uid: string) {
  const data = await Promise.all(db.tables.map(async (t) => [t, (await getDocs(collection(fs, 'coachUsers', uid, t.name))).docs.map((d) => d.data())] as const))
  setMuted(true)
  try {
    await db.transaction('rw', db.tables, async () => {
      for (const [t, rows] of data) if (rows.length) await t.bulkPut(rows)
    })
    const s = await db.kv.get('settings')
    if (s) await db.kv.put({ key: 'settings', value: { ...(s.value as object), onboarded: true } })
  } finally {
    setMuted(false)
  }
}

/**
 * On every sign-in / app start, the food log decides who is the source:
 * - cloud has no food log yet → this phone's data goes up (the first phone with history seeds the account)
 * - this phone has no food log (fresh setup) → it takes the cloud copy, settings included
 */
async function reconcile(user: User) {
  const cloudHasLog = !(await getDocs(query(collection(fs, 'coachUsers', user.uid, 'items'), limit(1)))).empty
  const localHasLog = (await db.items.count()) > 0
  if (!cloudHasLog && localHasLog) await uploadAll(user.uid)
  else if (cloudHasLog && !localHasLog) await downloadAll(user.uid)
  // shortcut: both sides have a log → keep this phone's copy and sync forward (no merge); fine while it's one person per phone
  await setDoc(doc(fs, 'coachUsers', user.uid), { name: user.displayName ?? '', email: user.email ?? '', seenAt: Date.now() }, { merge: true })
}

export function watchAuth(cb: (s: SyncState) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) { setSender(null); return cb({ user: null, status: 'idle' }) }
    cb({ user, status: 'syncing' })
    reconcile(user).then(
      () => { setSender(sender(user.uid)); cb({ user, status: 'synced' }) },
      (e) => { console.warn('sync', e); setSender(sender(user.uid)); cb({ user, status: 'error' }) },
    )
  })
}

/** Settings → "back up now": push every record on this phone to the account. */
export async function backupNow() {
  if (!auth.currentUser) throw new Error('not signed in')
  await uploadAll(auth.currentUser.uid)
}

/** Settings → "get my data from my account": pull the cloud copy into this phone (cloud wins on the same records). */
export async function pullFromCloud() {
  if (!auth.currentUser) throw new Error('not signed in')
  await downloadAll(auth.currentUser.uid)
}

// same as the Islam app: always a popup
export const signIn = () => signInWithPopup(auth, googleProvider)
export const logOut = () => signOut(auth)
