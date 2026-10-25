// The heavy half of cloud sync (Firebase), loaded after first paint. Dexie stays the source of truth (offline,
// instant); Firestore mirrors it per user at coachUsers/{uid}/{table}/{key}.
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch, query, limit, onSnapshot } from 'firebase/firestore'
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { db, DEMO, type FeedbackQueueItem } from './db.ts'
import { captureError } from './reports.ts'

const SKIP_SYNC_TABLES = new Set(['reports', 'feedbackQueue'])
import { auth, fs, googleProvider } from './firebase.ts'
import { setSender, setMuted, type Op, type SyncState, type Flags } from './syncCore.ts'

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
    if (SKIP_SYNC_TABLES.has(table.name)) continue
    const rows = await table.toArray()
    for (let i = 0; i < rows.length; i += 400) {
      const batch = writeBatch(fs)
      for (const r of rows.slice(i, i + 400)) batch.set(ref(uid, table.name, (r as Record<string, unknown>)[keyPath(table.name)]), clean(table.name, r))
      await batch.commit()
    }
  }
}

async function downloadAll(uid: string) {
  const syncTables = db.tables.filter((t) => !SKIP_SYNC_TABLES.has(t.name))
  const data = await Promise.all(syncTables.map(async (t) => [t, (await getDocs(collection(fs, 'coachUsers', uid, t.name))).docs.map((d) => d.data())] as const))
  setMuted(true)
  try {
    await db.transaction('rw', syncTables, async () => {
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
    // the sandbox never touches the real account's data
    if (DEMO) { setSender(null); return cb({ user, status: 'idle' }) }
    cb({ user, status: 'syncing' })
    reconcile(user).then(
      () => { setSender(sender(user.uid)); cb({ user, status: 'synced' }); flushReports().catch(() => {}) },
      (e) => { console.warn('sync', e); captureError(e, 'sync'); setSender(sender(user.uid)); cb({ user, status: 'error' }) },
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

// ── published features: coachConfig/features, readable by signed-in users, writable only by the admin (Firestore rules) ──
export function watchFlags(cb: (f: Flags) => void) {
  const defaults: Flags = { ai: false, feedback: false, library: false, routines: false, aiV2: false }
  return onSnapshot(doc(fs, 'coachConfig', 'features'), (snap) => cb({ ...defaults, ...(snap.data() as Partial<Flags> | undefined) }), () => cb(defaults))
}
export const setFlag = (name: keyof Flags, on: boolean) => setDoc(doc(fs, 'coachConfig', 'features'), { [name]: on }, { merge: true })

/** Fresh Firebase sign-in token for the AI relay. */
export const idToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve(null)

export async function flushReports() {
  const user = auth.currentUser
  if (!user || DEMO) return
  const queued = await db.feedbackQueue.toArray()
  for (const item of queued) {
    try {
      const docRef = doc(collection(fs, 'coachFeedback'))
      await setDoc(docRef, {
        kind: 'feedback',
        type: item.type,
        text: item.text.slice(0, 2000),
        doing: item.doing ? item.doing.slice(0, 500) : '',
        version: item.version,
        ua: (item.ua || '').slice(0, 250),
        recentReports: item.recentReports || [],
        uid: user.uid,
        createdAt: item.ts,
      })
      if (item.id !== undefined) await db.feedbackQueue.delete(item.id)
    } catch (e) {
      console.warn('flush feedback failed', e)
      break
    }
  }

  const unsent = await db.reports.filter((r) => !r.sent).toArray()
  for (const r of unsent) {
    try {
      const docRef = doc(collection(fs, 'coachFeedback'))
      await setDoc(docRef, {
        kind: 'report',
        key: r.key,
        message: r.message.slice(0, 500),
        stack: (r.stack || '').slice(0, 1000),
        version: r.version || '',
        tab: r.tab || '',
        ua: (r.ua || '').slice(0, 250),
        firstAt: r.firstAt,
        lastAt: r.lastAt,
        count: r.count,
        uid: user.uid,
        createdAt: Date.now(),
      })
      await db.reports.update(r.key, { sent: true })
    } catch (e) {
      console.warn('flush reports failed', e)
      break
    }
  }
}

export async function sendFeedback(data: { type: 'bug' | 'idea' | 'other'; text: string; doing?: string }) {
  const recent = await db.reports.orderBy('lastAt').reverse().limit(3).toArray()
  const item: FeedbackQueueItem = {
    type: data.type,
    text: data.text.trim(),
    doing: data.doing ? data.doing.trim() : undefined,
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.5.2',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    recentReports: recent.map((r) => r.key),
    ts: Date.now(),
  }
  await db.feedbackQueue.add(item)
  await flushReports()
}

export async function getFeedback() {
  const snap = await getDocs(collection(fs, 'coachFeedback'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function clearFeedback(ids: string[]) {
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(fs)
    for (const id of ids.slice(i, i + 400)) {
      batch.delete(doc(fs, 'coachFeedback', id))
    }
    await batch.commit()
  }
}

export async function summarizeFeedback(items: unknown[]): Promise<{ summary: string; taskPrompt: string }> {
  const token = await idToken()
  if (!token) throw new Error('not signed in')
  const res = await fetch('https://minis-coach-ai.minis-coach-relay.workers.dev/summarize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `summarize failed: ${res.status}`)
  }
  return res.json() as Promise<{ summary: string; taskPrompt: string }>
}
