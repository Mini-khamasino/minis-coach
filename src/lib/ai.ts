// The AI assistant: privacy gate → anonymous context → Groq (via our relay) → actions run on the phone → reply with Undo.
import { db, getSettings, today, makeItem, MEALS, type CoachMessage, type Meal, type Settings } from './db.ts'
import { sum, addDays, weightTrend, compute } from './calc.ts'
import { parseLine, norm, customCandidates, type ParserMemory } from './parser.ts'
import { EXERCISES, PROGRAMS, suggestProgram } from './exercises.ts'
import { nextDayIndex } from './training.ts'
import { idToken } from './syncCore.ts'
import { lang } from './i18n.ts'
import { sensitivity, type Sensitivity } from './privacy.ts'
import { captureError } from './reports.ts'
export type { Sensitivity }

export const RELAY_URL = 'https://minis-coach-ai.minis-coach-relay.workers.dev/chat'

// ── 2. anonymous context: numbers only — never name, email, photo or account id ──

async function context(s: Settings) {
  const d = today()
  const [items, week, weights, water, workouts, notes] = await Promise.all([
    db.items.where('date').equals(d).toArray(),
    db.items.where('date').between(addDays(d, -7), d).toArray(),
    db.weights.orderBy('date').toArray(),
    db.water.where('date').equals(d).toArray(),
    db.workouts.toArray(),
    db.notes.toArray(),
  ])
  const trend = weightTrend(weights)
  const last = weights.at(-1)
  const weekAgo = [...trend].filter(([k]) => k <= addDays(d, -7)).at(-1)?.[1]
  const program = PROGRAMS.find((p) => p.id === s.programId) ?? suggestProgram(s.trainDays, s.place)
  const t = sum(items)
  const days = [...new Set(week.map((i) => i.date))].sort().map((date) => {
    const x = sum(week.filter((i) => i.date === date))
    return { date, kcal: x.kcal, protein: Math.round(x.p) }
  })
  return {
    now: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
    person: { sex: s.sex === 'm' ? 'male' : 'female', age: s.age, heightCm: s.heightCm, goal: s.goalType, startKg: s.startKg, targetKg: s.targetKg },
    targets: { kcal: s.goal, protein: s.protein, waterMl: s.waterGoal, maintenance: s.maintenance },
    today: { date: d, kcal: t.kcal, protein: Math.round(t.p), carbs: Math.round(t.c), fat: Math.round(t.f), waterMl: water.reduce((a, w) => a + w.ml, 0),
      items: items.map((i) => ({ id: i.id, meal: i.meal, name: i.name, grams: i.grams, kcal: i.kcal })) },
    last7Days: days,
    weight: last ? { latestKg: last.kg, trendKg: trend.get(last.date), changeLast7Days: weekAgo ? +(trend.get(last.date)! - weekAgo).toFixed(1) : null } : null,
    training: { program: program.en, nextWorkout: program.days[nextDayIndex(workouts, program)].en, daysPerWeek: s.trainDays,
      sessionsLast7Days: new Set(workouts.filter((w) => w.endedAt && w.date >= addDays(d, -7)).map((w) => w.date)).size },
    notes: notes.map((n) => n.text),
  }
}

const SYSTEM = (ctx: unknown) => `You are the coach inside "Mini's Coach", a nutrition and gym app. Be a warm, practical, slightly funny coach.
Reply in ${lang === 'en' ? 'English' : 'Egyptian Arabic (عامية مصرية)'}; keep replies short (1–4 lines) unless asked to explain.
You never know the person's real name; when greeting, write {name} and the app fills it in. Never ask for personal identifying details.

Actions — use the tools, don't just describe:
- When they say they ate/drank something, call log_food. Give quantity+unit as they said it (e.g. 2 eggs, 1 loaf, 1 plate), grams only if they said grams, and ALWAYS estimated_grams (your best guess of the portion's weight) plus your per-100 g estimates (kcal_per_100, protein_per_100, carbs_per_100, fat_per_100) for EVERY item — Egyptian, Gulf, home-made, restaurant, desserts, anything. The app uses its own table when it knows the food and your numbers otherwise, so never refuse a food you know.
- For "how many calories in X" questions, answer from the app's numbers if X was logged, otherwise from your own knowledge (say it's an estimate).
- To change or remove something already logged today, use update_food with its id from today.items.
- Water → log_water, weigh-in → log_weight, gym sets → log_sets, lasting facts about them (preferences, schedule, dislikes) → save_note.
- Need another day's details → get_day.
- After acting, say briefly what you did; the app shows exact numbers itself.
Answer questions using their numbers below. If something is outside food, training, weight or daily habits, say briefly that you don't know.
No medical advice: for medical questions say to ask a doctor.

Their data (anonymous): ${JSON.stringify(ctx)}`

const str = { type: 'string' }, num = { type: 'number' }
const fn = (name: string, description: string, properties: object, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

const TOOLS = [
  fn('log_food', 'Log foods/drinks the person ate.', {
    items: { type: 'array', items: { type: 'object', required: ['name'], properties: {
      name: str, quantity: num, unit: str, grams: { type: 'number', description: 'only if the person said grams' }, estimated_grams: num, meal: { type: 'string', enum: MEALS },
      kcal_per_100: num, protein_per_100: num, carbs_per_100: num, fat_per_100: num,
    } } },
  }, ['items']),
  fn('update_food', "Change grams of, or delete, one of today's logged items.", { id: num, grams: num, delete: { type: 'boolean' } }, ['id']),
  fn('log_water', 'Log water they drank.', { ml: num }, ['ml']),
  fn('log_weight', "Log today's weigh-in.", { kg: num }, ['kg']),
  fn('log_sets', 'Log gym sets for one exercise.', { exercise: str, sets: { type: 'array', items: { type: 'object', properties: { kg: num, reps: num }, required: ['reps'] } } }, ['exercise', 'sets']),
  fn('save_note', 'Remember a lasting fact about the person.', { text: str }, ['text']),
  fn('get_day', 'Get the food log of another day.', { date: { type: 'string', description: 'YYYY-MM-DD' } }, ['date']),
]

type Undo = NonNullable<CoachMessage['undo']>
type ToolCall = { id: string; function: { name: string; arguments: string } }
type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }

const mealNow = (h = new Date().getHours()): Meal => (h < 4 ? 'سناك' : h < 11 ? 'فطار' : h < 17 ? 'غدا' : h < 22 ? 'عشا' : 'سناك')
const clamp = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : null)

/** Run one tool on the phone's own database; returns a short result for the model plus what to undo. */
async function run(call: ToolCall, undo: Undo, receipt: string[]): Promise<string> {
  let a: Record<string, unknown> = {}
  try { a = JSON.parse(call.function.arguments || '{}') } catch { return 'bad arguments' }
  const d = today()
  switch (call.function.name) {
    case 'log_food': {
      const [customs, memRow] = await Promise.all([db.customFoods.toArray(), db.kv.get('parserMemory')])
      const mem = (memRow?.value as ParserMemory | undefined) ?? { phrases: {}, portions: {} }
      const out: string[] = []
      for (const it of (Array.isArray(a.items) ? a.items : []) as Record<string, unknown>[]) {
        const name = String(it.name ?? '').slice(0, 80)
        const grams = clamp(it.grams, 1, 5000)
        const text = grams ? `${grams} جرام ${name}` : `${clamp(it.quantity, 0.1, 50) ?? ''} ${typeof it.unit === 'string' ? it.unit : ''} ${name}`
        const line = parseLine(norm(text), customCandidates(customs), mem)
        const meal = MEALS.includes(it.meal as Meal) ? (it.meal as Meal) : mealNow()
        let item
        if (line.match && line.score >= 60) {
          item = { ...makeItem(d, meal, line.match.name, line.match.foodId, line.grams, line.match.per100, line.match.oily, false), acc: line.acc }
        } else if (clamp(it.kcal_per_100, 1, 950)) {
          const per100 = { kcal: it.kcal_per_100 as number, p: clamp(it.protein_per_100, 0, 100) ?? 0, c: clamp(it.carbs_per_100, 0, 100) ?? 0, f: clamp(it.fat_per_100, 0, 100) ?? 0 }
          const g = grams ?? clamp(it.estimated_grams, 1, 3000) ?? Math.round(100 * ((clamp(it.quantity, 0.1, 50) as number) || 1))
          item = { ...makeItem(d, meal, name, null, g, per100, false, true), acc: grams ? ('w' as const) : ('p' as const) }
          // remember it, so next time it's found instantly (and offline); the person can correct it from the food list
          if (!customs.some((c) => norm(c.name) === norm(name))) await db.customFoods.put({ name, per100 })
        } else { out.push(`${name}: no estimate given — estimate kcal_per_100 yourself and call log_food again`); continue }
        const id = await db.items.add(item)
        undo.items.push(id as number)
        receipt.push(`${item.name} ${item.grams}g · ${item.kcal} kcal${item.estimated ? ' (~)' : ''}`)
        out.push(`${item.name} ${item.grams}g = ${item.kcal} kcal`)
      }
      return out.join('; ') || 'nothing logged'
    }
    case 'update_food': {
      const id = clamp(a.id, 1, 1e9)
      const it = id ? await db.items.get(id) : undefined
      if (!it || it.date !== d) return 'no such item today'
      undo.restore.push(it)
      if (a.delete) { await db.items.delete(it.id!); receipt.push(`🗑️ ${it.name}`); return 'deleted' }
      const g = clamp(a.grams, 1, 5000)
      if (!g) return 'no grams given'
      await db.items.update(it.id!, { grams: g, ...compute(it.per100, g, it.margin) })
      receipt.push(`✏️ ${it.name} → ${g}g`)
      return `updated to ${g}g`
    }
    case 'log_water': {
      const ml = clamp(a.ml, 50, 5000)
      if (!ml) return 'bad amount'
      undo.water.push((await db.water.add({ date: d, ml, ts: Date.now() })) as number)
      receipt.push(`💧 ${ml} ml`)
      return 'logged'
    }
    case 'log_weight': {
      const kg = clamp(a.kg, 30, 300)
      if (!kg) return 'bad weight'
      const prev = await db.weights.get(d)
      undo.weights.push({ date: d, prevKg: prev?.kg ?? null })
      await db.weights.put({ date: d, kg: Math.round(kg * 10) / 10 })
      receipt.push(`⚖️ ${kg} kg`)
      return 'logged'
    }
    case 'log_sets': {
      const q = norm(String(a.exercise ?? ''))
      const ex = Object.values(EXERCISES).find((e) => norm(e.ar) === q || norm(e.en) === q)
        ?? Object.values(EXERCISES).find((e) => norm(e.ar).includes(q) || norm(e.en).includes(q) || q.includes(norm(e.en)))
      if (!ex) return 'unknown exercise — ask which one'
      const sets = ((Array.isArray(a.sets) ? a.sets : []) as Record<string, unknown>[]).map((x) => ({ kg: clamp(x.kg, 0, 500) ?? 0, reps: clamp(x.reps, 1, 100) ?? 0, done: true })).filter((x) => x.reps)
      if (!sets.length) return 'no sets'
      const s = await getSettings()
      const program = PROGRAMS.find((p) => p.id === s.programId) ?? suggestProgram(s.trainDays, s.place)
      const open = (await db.workouts.where('date').equals(d).toArray()).find((w) => !w.endedAt) ?? (await db.workouts.where('date').equals(d).toArray()).at(-1)
      if (open) {
        undo.restoreWorkout.push(structuredClone(open))
        await db.workouts.update(open.id!, { exercises: [...open.exercises, { exId: ex.id, sets }] })
      } else {
        const now = Date.now()
        undo.workouts.push((await db.workouts.add({ date: d, startedAt: now, endedAt: now, programId: program.id, dayIndex: nextDayIndex(await db.workouts.toArray(), program), exercises: [{ exId: ex.id, sets }] })) as number)
      }
      receipt.push(`🏋️ ${lang === 'en' ? ex.en : ex.ar} ${sets.map((x) => `${x.kg}×${x.reps}`).join(' ')}`)
      return 'logged'
    }
    case 'save_note': {
      const text = String(a.text ?? '').slice(0, 200).trim()
      if (!text) return 'empty'
      undo.notes.push((await db.notes.add({ text, ts: Date.now() })) as number)
      const ids = await db.notes.orderBy('id').primaryKeys()
      if (ids.length > 30) await db.notes.bulkDelete(ids.slice(0, ids.length - 30))
      return 'saved'
    }
    case 'get_day': {
      const date = String(a.date ?? '')
      const items = await db.items.where('date').equals(date).toArray()
      return JSON.stringify({ date, total: sum(items).kcal, items: items.map((i) => ({ name: i.name, grams: i.grams, kcal: i.kcal, meal: i.meal })) })
    }
  }
  return 'unknown tool'
}

export class AiError extends Error {}

/** Developer page: which Groq models the relay is set to use vs what the key can call. */
export async function checkModels(): Promise<{ configured: string[]; available: string[] }> {
  const token = await idToken()
  const r = await fetch(RELAY_URL.replace('/chat', '/models'), { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new AiError(`relay ${r.status}`)
  return r.json()
}

async function relay(messages: Msg[]): Promise<{ message: Msg; remaining: number | null }> {
  const token = await idToken()
  if (!token) throw new AiError(lang === 'en' ? 'Sign in to use the AI' : 'سجل دخول الأول عشان تستخدم الـ AI')
  const r = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, tools: TOOLS }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => { throw new AiError(lang === 'en' ? 'No connection to the AI' : 'مفيش اتصال بالـ AI') })
  if (r.status === 429) throw new AiError(lang === 'en' ? "You've used today's AI messages — back tomorrow" : 'خلصت رسايل الـ AI النهارده — بكره ترجع')
  if (r.status === 403) throw new AiError(lang === 'en' ? 'The AI is not available yet' : 'الـ AI لسه مش متاح')
  if (!r.ok) throw new AiError(lang === 'en' ? 'The AI is busy — try again in a minute' : 'الـ AI زحمة — جرب كمان دقيقة')
  const remaining = r.headers.get('X-Remaining')
  return { message: ((await r.json()) as { message: Msg }).message, remaining: remaining ? Number(remaining) : null }
}

/**
 * One turn: store the question, gate it, ask the AI, run its actions, store the reply (with Undo).
 * Returns 'private' | 'eating' | 'crisis' when the message was kept on the phone instead.
 */
export async function chat(text: string): Promise<Sensitivity> {
  const s = await getSettings()
  const d = today()
  const ts = Date.now()
  await db.messages.add({ key: `ask:${ts}`, kind: 'ask', date: d, ts, text: text.trim(), read: true })
  const level = sensitivity(text)
  if (level !== 'ok') {
    await db.messages.add({ key: `private:${ts}`, kind: 'private', date: d, ts: ts + 1, text: level, privateQ: text.trim(), read: true })
    return level
  }

  const history = (await db.messages.where('date').equals(d).toArray())
    .filter((m) => (m.kind === 'ask' || m.kind === 'ai') && m.ts < ts).slice(-8)
    .map((m): Msg => ({ role: m.kind === 'ask' ? 'user' : 'assistant', content: m.text }))
  const messages: Msg[] = [{ role: 'system', content: SYSTEM(await context(s)) }, ...history, { role: 'user', content: text.trim() }]

  const undo: Undo = { items: [], water: [], weights: [], workouts: [], notes: [], restore: [], restoreWorkout: [] }
  const receipt: string[] = []
  let reply = ''
  let remaining: number | null = null
  try {
    // up to 3 rounds: most turns need one (actions run here; the model's text is the reply)
    for (let round = 0; round < 3; round++) {
      const res = await relay(messages)
      remaining = res.remaining
      const m = res.message
      if (!m.tool_calls?.length) { reply = m.content ?? ''; break }
      messages.push({ role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls })
      for (const call of m.tool_calls) messages.push({ role: 'tool', tool_call_id: call.id, content: await run(call, undo, receipt) })
      reply = m.content ?? ''
      // only go back to the model when it asked to read something or nothing got logged
      if (!m.tool_calls.some((c) => c.function.name === 'get_day') && receipt.length) break
    }
  } catch (e) {
    captureError(e, 'ai')
    reply = (e as Error).message
  }
  const name = s.name || ''
  await db.messages.add({
    key: `ai:${ts}`, kind: 'ai', date: d, ts: ts + 1, read: true,
    text: (reply || '').replaceAll('{name}', name).trim() || '✅',
    receipt: receipt.length ? receipt : undefined,
    undo: Object.values(undo).some((v) => v.length) ? undo : undefined,
    remaining: remaining ?? undefined,
  })
  return 'ok'
}

/** Reverse everything one AI reply did. */
export async function undoTurn(m: CoachMessage) {
  const u = m.undo
  if (!u) return
  await db.transaction('rw', [db.items, db.water, db.weights, db.workouts, db.notes, db.messages], async () => {
    await db.items.bulkDelete(u.items)
    await db.items.bulkPut(u.restore)
    await db.water.bulkDelete(u.water)
    for (const w of u.weights) w.prevKg === null ? await db.weights.delete(w.date) : await db.weights.put({ date: w.date, kg: w.prevKg })
    await db.workouts.bulkDelete(u.workouts)
    await db.workouts.bulkPut(u.restoreWorkout)
    await db.notes.bulkDelete(u.notes)
    await db.messages.update(m.id!, { undone: true })
  })
}
