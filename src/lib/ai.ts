// The AI assistant: privacy gate → anonymous context → Groq (via our relay) → actions run on the phone → reply with Undo.
import {
  db,
  getSettings,
  saveSettings,
  today,
  makeItem,
  MEALS,
  DEFAULTS,
  type CoachMessage,
  type Meal,
  type Settings,
  type Routine,
  type WorkoutSet,
} from './db.ts'
import { sum, addDays, weightTrend, compute } from './calc.ts'
import { parseLine, norm, customCandidates, search, type ParserMemory } from './parser.ts'
import { EXERCISES, PROGRAMS, suggestProgram } from './exercises.ts'
import { nextDayIndex } from './training.ts'
import { loadLibrary, searchLibrary, ACTIVITIES, activityKcal } from './library.ts'
import { idToken, isAiV2 } from './syncCore.ts'
import { lang } from './i18n.ts'
import { sensitivity, type Sensitivity } from './privacy.ts'
import { captureError } from './reports.ts'
import {
  clamp,
  summarizeRecentChat,
  validateFoodInfoArgs,
  validateSearchExercisesArgs,
  validateCreateRoutineArgs,
  validateLogActivityArgs,
  validateSetTargetsArgs,
  validateGetHistoryArgs,
  SYSTEM_V1,
  SYSTEM_V2,
} from './aiHelpers.ts'

export type { Sensitivity }

export const RELAY_URL = 'https://minis-coach-ai.minis-coach-relay.workers.dev/chat'

// ── 2. anonymous context: numbers only — never name, email, photo or account id ──

async function context(s: Settings, v2: boolean) {
  const d = today()
  const [items, week, weights, water, workouts, notes, routines] = await Promise.all([
    db.items.where('date').equals(d).toArray(),
    db.items.where('date').between(addDays(d, -7), d).toArray(),
    db.weights.orderBy('date').toArray(),
    db.water.where('date').equals(d).toArray(),
    db.workouts.toArray(),
    db.notes.toArray(),
    db.routines.toArray(),
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

  const base = {
    now: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
    person: { sex: s.sex === 'm' ? 'male' : 'female', age: s.age, heightCm: s.heightCm, goal: s.goalType, startKg: s.startKg, targetKg: s.targetKg },
    targets: { kcal: s.goal, protein: s.protein, waterMl: s.waterGoal, maintenance: s.maintenance },
    today: {
      date: d,
      kcal: t.kcal,
      protein: Math.round(t.p),
      carbs: Math.round(t.c),
      fat: Math.round(t.f),
      waterMl: water.reduce((a, w) => a + w.ml, 0),
      items: items.map((i) => ({ id: i.id, meal: i.meal, name: i.name, grams: i.grams, kcal: i.kcal })),
    },
    last7Days: days,
    weight: last ? { latestKg: last.kg, trendKg: trend.get(last.date), changeLast7Days: weekAgo ? +(trend.get(last.date)! - weekAgo).toFixed(1) : null } : null,
    training: {
      program: program.en,
      nextWorkout: program.days[nextDayIndex(workouts, program)].en,
      daysPerWeek: s.trainDays,
      sessionsLast7Days: new Set(workouts.filter((w) => w.endedAt && w.date >= addDays(d, -7)).map((w) => w.date)).size,
    },
    notes: notes.map((n) => n.text),
  }

  if (!v2) return base

  const pastMsgs = await db.messages.where('date').between(addDays(d, -3), d, true, false).toArray()
  const recentHistory = summarizeRecentChat(pastMsgs, d)

  return {
    ...base,
    remaining: {
      kcal: Math.max(0, s.goal - t.kcal),
      protein: Math.max(0, Math.round(s.protein - t.p)),
      carbs: Math.round(Math.max(0, (s.goal * 0.4) / 4 - t.c)),
      fat: Math.round(Math.max(0, (s.goal * 0.25) / 9 - t.f)),
    },
    routines: routines.map((r) => ({ id: r.id, name: r.name, schedule: r.schedule, count: r.exercises.length })),
    recentChatSummary: recentHistory || undefined,
  }
}

const str = { type: 'string' }, num = { type: 'number' }
const fn = (name: string, description: string, properties: object, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

const TOOLS_V1 = [
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

const TOOLS_V2 = [
  ...TOOLS_V1,
  fn('food_info', 'Get exact nutrition per 100g for specific foods to calculate portion grams.', {
    names: { type: 'array', items: str, description: 'Food names to look up, e.g. ["صدور فراخ", "رز مسلوق"]' },
  }, ['names']),
  fn('search_exercises', 'Search the exercise library by name, muscle, equipment, or place.', {
    query: { type: 'string', description: 'Search keywords in Arabic or English' },
    muscle: { type: 'string', description: 'Body muscle, e.g. chest, back, quadriceps, bicep, shoulders, abs' },
    equipment: { type: 'string', description: 'Equipment, e.g. barbell, dumbbell, body weight, cable, machine' },
    place: { type: 'string', enum: ['gym', 'home', 'outside'], description: 'Workout location' },
  }, ['query']),
  fn('create_routine', 'Create a new training routine with schedule and exercises. Ask 2-4 short questions first if goal, days, place, equipment, or session time are unknown.', {
    name: { type: 'string', description: 'Routine name, e.g. "Push 3 Days"' },
    schedule: {
      type: 'object',
      required: ['mode', 'days'],
      properties: {
        mode: { type: 'string', enum: ['days', 'rotation'] },
        days: { type: 'array', items: num, description: 'Days of week: 0=Sun, 1=Mon, ..., 6=Sat' },
        time: { type: 'string', description: 'Optional HH:MM time e.g. "18:00"' },
      },
    },
    exercises: {
      type: 'array',
      description: 'List of exercises in the routine',
      items: {
        type: 'object',
        required: ['id', 'sets'],
        properties: {
          id: { type: 'string', description: 'Exercise id from library or legacy exercise list' },
          kind: { type: 'string', enum: ['lib', 'activity', 'legacy'] },
          type: { type: 'string', enum: ['reps', 'time', 'distance'] },
          sets: { type: 'number', description: 'Number of sets (1-15)' },
          reps: { type: 'number', description: 'Reps per set if type is reps' },
          kg: { type: 'number', description: 'Target weight in kg' },
          seconds: { type: 'number', description: 'Duration in seconds if type is time' },
          meters: { type: 'number', description: 'Distance in meters if type is distance' },
          restSec: { type: 'number', description: 'Rest seconds between sets' },
          notes: { type: 'string', description: 'Exercise tips or notes' },
        },
      },
    },
  }, ['name', 'schedule', 'exercises']),
  fn('log_activity', 'Log an outdoor, sport, or cardio activity (running, walking, cycling, football, padel, etc.) with MET calories.', {
    name: { type: 'string', description: 'Activity name in Arabic or English, e.g. "جري", "padel", "نط حبل", "walking"' },
    minutes: { type: 'number', description: 'Duration in minutes (1-600)' },
    distance_km: { type: 'number', description: 'Optional distance in kilometers' },
  }, ['name', 'minutes']),
  fn('set_targets', 'Change the daily calorie, protein, or water targets. ONLY call this after the person explicitly confirms in chat (e.g. "تمام غيرهم" or "yes set them").', {
    kcal: { type: 'number', description: 'Daily calorie goal (500-8000)' },
    protein: { type: 'number', description: 'Daily protein goal in grams (20-400)' },
    water_ml: { type: 'number', description: 'Daily water goal in ml (500-10000)' },
  }),
  fn('get_history', 'Get recent daily totals, weights, and workout history for trend analysis.', {
    days: { type: 'number', description: 'Number of past days to retrieve (1-30, default 7)' },
  }),
]

const READ_TOOLS = new Set(['get_day', 'food_info', 'search_exercises', 'get_history'])

type Undo = NonNullable<CoachMessage['undo']>
type ToolCall = { id: string; function: { name: string; arguments: string } }
type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }

const mealNow = (h = new Date().getHours()): Meal => (h < 4 ? 'سناك' : h < 11 ? 'فطار' : h < 17 ? 'غدا' : h < 22 ? 'عشا' : 'سناك')

/** Run one tool on the phone's own database; returns a short result for the model plus what to undo. */
async function run(call: ToolCall, undo: Undo, receipt: string[], s: Settings): Promise<string> {
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

    // ── AI v2 tools ──

    case 'food_info': {
      const args = validateFoodInfoArgs(a)
      if (!args) return 'no food names given'
      const customs = customCandidates(await db.customFoods.toArray())
      const out = args.names.map((name) => {
        const hits = search(name, customs, false, 1)
        if (hits.length > 0) {
          const c = hits[0]
          return {
            query: name,
            found: true,
            name: c.name,
            per100: c.per100,
            serving: c.serving ? { grams: c.serving[0], unit: c.serving[1] } : undefined,
          }
        }
        return { query: name, found: false }
      })
      return JSON.stringify(out)
    }

    case 'search_exercises': {
      const args = validateSearchExercisesArgs(a)
      const lib = await loadLibrary()
      const hits = searchLibrary(args.query, lib, {
        place: args.place,
        equipment: args.equipment,
        muscle: args.muscle as any,
      })
      const out = hits.slice(0, 6).map((e) => ({
        id: e.id,
        name: e.name,
        arName: e.arName,
        place: e.place,
        equipment: e.equipment,
        category: e.category,
        muscles: e.primaryMuscles,
      }))
      return JSON.stringify(out.length ? out : { message: 'no matching exercises in library' })
    }

    case 'create_routine': {
      const args = validateCreateRoutineArgs(a)
      if (!args) return 'invalid routine parameters — need name, schedule, and at least one exercise'
      const id = `routine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const routine: Routine = {
        id,
        name: args.name,
        schedule: args.schedule,
        exercises: args.exercises,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await db.routines.put(routine)
      undo.routines ??= []
      undo.routines.push(routine.id)
      receipt.push(lang === 'en' ? `📋 Routine: ${routine.name}` : `📋 روتين: ${routine.name}`)
      return JSON.stringify({ created: true, id: routine.id, name: routine.name, exerciseCount: routine.exercises.length })
    }

    case 'log_activity': {
      const args = validateLogActivityArgs(a)
      if (!args) return 'invalid activity — need name and minutes (1-600)'
      const q = norm(args.name)
      const act = ACTIVITIES.find((x) => norm(x.ar) === q || norm(x.en) === q || norm(x.id) === q)
        ?? ACTIVITIES.find((x) => norm(x.ar).includes(q) || norm(x.en).includes(q) || q.includes(norm(x.en)) || q.includes(norm(x.ar)))
      if (!act) return `unknown activity "${args.name}" — check activity name`
      const lastWeight = (await db.weights.orderBy('date').last())?.kg ?? s.startKg ?? 70
      const kcal = activityKcal(act.met, lastWeight, args.minutes)
      const setObj: WorkoutSet = {
        kg: 0,
        seconds: args.minutes * 60,
        reps: args.minutes,
        meters: args.distance_km ? Math.round(args.distance_km * 1000) : undefined,
        done: true,
      }
      const open = (await db.workouts.where('date').equals(d).toArray()).find((w) => !w.endedAt) ?? (await db.workouts.where('date').equals(d).toArray()).at(-1)
      if (open) {
        undo.restoreWorkout.push(structuredClone(open))
        await db.workouts.update(open.id!, { exercises: [...open.exercises, { exId: `activity:${act.id}`, sets: [setObj] }] })
      } else {
        const now = Date.now()
        undo.workouts.push((await db.workouts.add({
          date: d,
          startedAt: now,
          endedAt: now,
          programId: '',
          dayIndex: 0,
          exercises: [{ exId: `activity:${act.id}`, sets: [setObj] }],
        })) as number)
      }
      receipt.push(lang === 'en' ? `🏃 ${act.en} ${args.minutes} min · ~${kcal} kcal` : `🏃 ${act.ar} ${args.minutes} د · ~${kcal} سعر`)
      return JSON.stringify({ logged: true, activity: act.en, minutes: args.minutes, kcal, distanceKm: args.distance_km ?? null })
    }

    case 'set_targets': {
      const args = validateSetTargetsArgs(a)
      if (!args) return 'no targets given'
      undo.prevTargets = { kcal: s.goal, protein: s.protein, waterGoal: s.waterGoal }
      const patch: Partial<Settings> = {}
      if (args.kcal) patch.goal = args.kcal
      if (args.protein) patch.protein = args.protein
      if (args.water) patch.waterGoal = args.water
      await saveSettings(patch)
      const parts: string[] = []
      if (args.kcal) parts.push(`${args.kcal} kcal`)
      if (args.protein) parts.push(`${args.protein}g protein`)
      if (args.water) parts.push(`${args.water} ml water`)
      receipt.push(`🎯 ${parts.join(' · ')}`)
      return JSON.stringify({ updated: true, newTargets: { kcal: patch.goal ?? s.goal, protein: patch.protein ?? s.protein, waterGoal: patch.waterGoal ?? s.waterGoal } })
    }

    case 'get_history': {
      const args = validateGetHistoryArgs(a)
      const startDate = addDays(d, -args.days)
      const [items, weights, workouts] = await Promise.all([
        db.items.where('date').between(startDate, d).toArray(),
        db.weights.where('date').between(startDate, d).toArray(),
        db.workouts.where('date').between(startDate, d).toArray(),
      ])
      const dailyTotals = [...new Set(items.map((i) => i.date))].sort().map((date) => {
        const dayItems = items.filter((i) => i.date === date)
        const t = sum(dayItems)
        return { date, kcal: t.kcal, protein: Math.round(t.p) }
      })
      const weightPoints = weights.map((w) => ({ date: w.date, kg: w.kg }))
      const workoutDays = workouts.map((w) => ({ date: w.date, exercises: w.exercises.length }))
      return JSON.stringify({ range: { from: startDate, to: d }, dailyTotals, weights: weightPoints, workouts: workoutDays })
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

async function relay(messages: Msg[], tools: object[]): Promise<{ message: Msg; remaining: number | null }> {
  const token = await idToken()
  if (!token) throw new AiError(lang === 'en' ? 'Sign in to use the AI' : 'سجل دخول الأول عشان تستخدم الـ AI')
  const r = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, tools }),
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
export async function chat(text: string, options?: { aiV2?: boolean }): Promise<Sensitivity> {
  const s = await getSettings()
  const d = today()
  const ts = Date.now()
  const v2 = options?.aiV2 ?? isAiV2()

  await db.messages.add({ key: `ask:${ts}`, kind: 'ask', date: d, ts, text: text.trim(), read: true })
  const level = sensitivity(text)
  if (level !== 'ok') {
    await db.messages.add({ key: `private:${ts}`, kind: 'private', date: d, ts: ts + 1, text: level, privateQ: text.trim(), read: true })
    return level
  }

  const history = (await db.messages.where('date').equals(d).toArray())
    .filter((m) => (m.kind === 'ask' || m.kind === 'ai') && m.ts < ts).slice(-8)
    .map((m): Msg => ({ role: m.kind === 'ask' ? 'user' : 'assistant', content: m.text }))

  const ctx = await context(s, v2)
  const systemPrompt = v2 ? SYSTEM_V2(ctx, lang) : SYSTEM_V1(ctx, lang)
  const tools = v2 ? TOOLS_V2 : TOOLS_V1

  const messages: Msg[] = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: text.trim() }]

  const undo: Undo = { items: [], water: [], weights: [], workouts: [], notes: [], restore: [], restoreWorkout: [], routines: [] }
  const receipt: string[] = []
  let reply = ''
  let remaining: number | null = null

  try {
    for (let round = 0; round < 3; round++) {
      const res = await relay(messages, tools)
      remaining = res.remaining
      const m = res.message
      if (!m.tool_calls?.length) { reply = m.content ?? ''; break }
      messages.push({ role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls })
      for (const call of m.tool_calls) messages.push({ role: 'tool', tool_call_id: call.id, content: await run(call, undo, receipt, s) })
      reply = m.content ?? ''
      const hasReadTool = m.tool_calls.some((c) => READ_TOOLS.has(c.function.name))
      if (!hasReadTool && (receipt.length > 0 || reply.trim())) break
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
    undo: Object.values(undo).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined)) ? undo : undefined,
    remaining: remaining ?? undefined,
  })
  return 'ok'
}

/** Reverse everything one AI reply did. */
export async function undoTurn(m: CoachMessage) {
  const u = m.undo
  if (!u) return
  await db.transaction('rw', [db.items, db.water, db.weights, db.workouts, db.notes, db.messages, db.routines, db.kv], async () => {
    await db.items.bulkDelete(u.items)
    await db.items.bulkPut(u.restore)
    await db.water.bulkDelete(u.water)
    for (const w of u.weights) w.prevKg === null ? await db.weights.delete(w.date) : await db.weights.put({ date: w.date, kg: w.prevKg })
    await db.workouts.bulkDelete(u.workouts)
    await db.workouts.bulkPut(u.restoreWorkout)
    await db.notes.bulkDelete(u.notes)
    if (u.routines?.length) await db.routines.bulkDelete(u.routines)
    if (u.prevTargets) {
      const curRow = await db.kv.get('settings')
      const cur = (curRow?.value as Settings | undefined) ?? DEFAULTS
      await db.kv.put({
        key: 'settings',
        value: {
          ...cur,
          ...(u.prevTargets.kcal !== undefined ? { goal: u.prevTargets.kcal } : {}),
          ...(u.prevTargets.protein !== undefined ? { protein: u.prevTargets.protein } : {}),
          ...(u.prevTargets.waterGoal !== undefined ? { waterGoal: u.prevTargets.waterGoal } : {}),
        },
      })
    }
    await db.messages.update(m.id!, { undone: true })
  })
}
