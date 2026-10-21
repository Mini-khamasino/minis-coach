// Test mode sample data: a believable week so features can be tried without touching real stats.
import { db, DEMO, DEFAULTS, makeItem, saveSettings, today, type Meal } from './db.ts'
import { FOODS } from './foods.ts'
import { addDays, targetsFor } from './calc.ts'

const DAY: [Meal, string, number][][] = [
  [['فطار', 'egg', 100], ['فطار', 'aish_baladi', 90], ['غدا', 'kabsa', 400], ['عشا', 'greek_yogurt', 170], ['سناك', 'dates', 30]],
  [['فطار', 'foul_oil', 250], ['فطار', 'aish_baladi', 90], ['غدا', 'chicken_breast', 200], ['غدا', 'rice_egy', 200], ['عشا', 'tuna_water', 120]],
  [['فطار', 'oats', 50], ['فطار', 'milk', 240], ['غدا', 'mandi', 450], ['سناك', 'konafa', 100], ['عشا', 'salad', 200]],
]

export async function seedDemo() {
  if (!DEMO || (await db.kv.get('demoSeeded'))) return
  const t = targetsFor({ sex: 'm', age: 24, heightCm: 178, kg: 92, activity: 1.55, goalType: 'cut' })
  const start = addDays(today(), -7)
  await saveSettings({ ...DEFAULTS, ...t, onboarded: true, name: 'تجربة', sex: 'm', age: 24, heightCm: 178, activity: 1.55, goalType: 'cut', trainDays: 4, startDate: start, startKg: 92, targetKg: 82, waterGoal: 3250, lastBackup: Date.now() })
  const items = []
  for (let n = 7; n >= 1; n--) {
    const d = addDays(today(), -n)
    for (const [meal, id, g] of DAY[n % DAY.length]) {
      const f = FOODS[id]
      items.push({ ...makeItem(d, meal, f.name, id, g, f, f.oily, false), acc: 'p' as const })
    }
  }
  await db.items.bulkAdd(items)
  await db.weights.bulkPut(Array.from({ length: 8 }, (_, n) => ({ date: addDays(today(), -7 + n), kg: Math.round((92 - n * 0.15 + (n % 3 === 0 ? 0.4 : 0)) * 10) / 10 })))
  await db.water.bulkAdd(Array.from({ length: 7 }, (_, n) => ({ date: addDays(today(), -1 - n), ml: 2000 + (n % 3) * 500, ts: Date.now() })))
  const h = 3600_000
  await db.workouts.bulkAdd([
    { date: addDays(today(), -3), startedAt: Date.now() - 3 * 86400_000, endedAt: Date.now() - 3 * 86400_000 + h, programId: 'upper_lower', dayIndex: 0, exercises: [{ exId: 'bench', sets: [{ kg: 60, reps: 8, done: true }, { kg: 60, reps: 7, done: true }] }, { exId: 'barbell_row', sets: [{ kg: 50, reps: 10, done: true }] }] },
    { date: addDays(today(), -1), startedAt: Date.now() - 86400_000, endedAt: Date.now() - 86400_000 + h, programId: 'upper_lower', dayIndex: 1, exercises: [{ exId: 'squat', sets: [{ kg: 70, reps: 6, done: true }, { kg: 70, reps: 6, done: true }] }, { exId: 'rdl', sets: [{ kg: 60, reps: 8, done: true }] }] },
  ])
  await db.kv.put({ key: 'demoSeeded', value: true })
}

export function setDemo(on: boolean) {
  try { on ? localStorage.setItem('demo', '1') : localStorage.removeItem('demo') } catch { /* private mode */ }
  location.reload()
}

/** Throw the sandbox away and start it fresh. */
export async function resetDemo() {
  db.close()
  await new Promise((r) => { const q = indexedDB.deleteDatabase('minis-coach-demo'); q.onsuccess = q.onerror = q.onblocked = r })
  location.reload()
}
