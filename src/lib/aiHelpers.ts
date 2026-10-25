// Pure helpers for AI coach v2: argument validation, recent history summarizer, and prompt builders.
// Pure logic only — NO Firebase or React imports here, so selfcheck.ts can import safely.
import { addDays } from './calc.ts'
import type { Routine, RoutineExercise } from './db.ts'

export const clamp = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && !Number.isNaN(v) && v >= lo && v <= hi ? v : null

export const clampCap = (v: unknown, lo: number, hi: number): number | null => {
  if (typeof v !== 'number' || Number.isNaN(v) || v < lo) return null
  return Math.min(v, hi)
}

export function summarizeRecentChat(
  messages: { kind: string; text: string; date: string }[],
  todayDate: string,
): string {
  const day1 = addDays(todayDate, -3)
  const day2 = addDays(todayDate, -2)
  const day3 = addDays(todayDate, -1)
  const validDates = new Set([day1, day2, day3])

  const relevant = messages.filter(
    (m) => validDates.has(m.date) && (m.kind === 'ask' || m.kind === 'ai' || m.kind === 'answer'),
  )

  if (!relevant.length) return ''

  const byDate = new Map<string, typeof relevant>()
  for (const m of relevant) {
    const list = byDate.get(m.date) ?? []
    list.push(m)
    byDate.set(m.date, list)
  }

  const lines: string[] = []
  const sortedDates = [...byDate.keys()].sort()

  for (const date of sortedDates) {
    const list = byDate.get(date)!
    const asks = list.filter((m) => m.kind === 'ask').map((m) => m.text.trim()).filter(Boolean)
    const replies = list.filter((m) => m.kind === 'ai' || m.kind === 'answer').map((m) => m.text.trim()).filter(Boolean)

    let summary = ''
    if (asks.length > 0) {
      const topics = asks.map((a) => (a.length > 40 ? a.slice(0, 37) + '…' : a)).join('; ')
      summary = `User: ${topics}`
    } else if (replies.length > 0) {
      const first = replies[0]
      summary = `Coach: ${first.length > 45 ? first.slice(0, 42) + '…' : first}`
    }

    if (summary) {
      lines.push(`• ${date}: ${summary}`)
    }
  }

  return lines.slice(0, 3).join('\n')
}

// ── Tool argument validators ──

export function validateFoodInfoArgs(raw: unknown): { names: string[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (!Array.isArray(a.names)) return null
  const names = a.names
    .map((n) => (typeof n === 'string' ? n.trim().slice(0, 60) : ''))
    .filter(Boolean)
    .slice(0, 10)
  return names.length > 0 ? { names } : null
}

export function validateSearchExercisesArgs(raw: unknown): {
  query: string
  muscle?: string
  equipment?: string
  place?: 'gym' | 'home' | 'outside'
} {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const query = typeof a.query === 'string' ? a.query.trim().slice(0, 60) : ''
  const muscle = typeof a.muscle === 'string' && a.muscle.trim() ? a.muscle.trim().slice(0, 30) : undefined
  const equipment = typeof a.equipment === 'string' && a.equipment.trim() ? a.equipment.trim().slice(0, 30) : undefined
  const place = (a.place === 'gym' || a.place === 'home' || a.place === 'outside') ? a.place : undefined
  return { query, muscle, equipment, place }
}

export function validateCreateRoutineArgs(raw: unknown): {
  name: string
  schedule: Routine['schedule']
  exercises: RoutineExercise[]
} | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const name = typeof a.name === 'string' ? a.name.trim().slice(0, 60) : ''
  if (!name) return null

  // Schedule
  const sched = (a.schedule && typeof a.schedule === 'object' ? a.schedule : {}) as Record<string, unknown>
  const mode = sched.mode === 'rotation' ? 'rotation' : 'days'
  const rawDays = Array.isArray(sched.days) ? sched.days : [1, 3, 5]
  const days = rawDays
    .map((d) => clamp(d, 0, 6))
    .filter((d): d is number => d !== null)
  const time = typeof sched.time === 'string' && /^\d{1,2}:\d{2}$/.test(sched.time) ? sched.time : undefined

  // Exercises
  if (!Array.isArray(a.exercises) || a.exercises.length === 0) return null
  const exercises: RoutineExercise[] = []

  for (const item of a.exercises.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue
    const ex = item as Record<string, unknown>
    const id = typeof ex.id === 'string' ? ex.id.trim().slice(0, 80) : ''
    if (!id) continue

    const rawKind = ex.kind ?? (ex.ref && typeof ex.ref === 'object' ? (ex.ref as Record<string, unknown>).kind : undefined)
    const kind = rawKind === 'activity' || rawKind === 'legacy' || rawKind === 'lib'
      ? rawKind
      : id.startsWith('activity:') ? 'activity' : 'lib'

    const type = ex.type === 'time' || ex.type === 'distance' ? ex.type : 'reps'
    const sets = clampCap(ex.sets, 1, 15) ?? 3
    const reps = clampCap(ex.reps, 1, 100) ?? (type === 'reps' ? 10 : undefined)
    const kg = clamp(ex.kg, 0, 500) ?? undefined
    const seconds = clamp(ex.seconds, 1, 7200) ?? (type === 'time' ? 60 : undefined)
    const meters = clamp(ex.meters, 1, 100_000) ?? (type === 'distance' ? 1000 : undefined)
    const restSec = clamp(ex.restSec, 0, 600) ?? 90
    const notes = typeof ex.notes === 'string' ? ex.notes.trim().slice(0, 100) : undefined

    exercises.push({
      ref: { kind, id },
      type,
      sets,
      reps,
      kg,
      seconds,
      meters,
      restSec,
      notes,
    })
  }

  if (exercises.length === 0) return null
  return { name, schedule: { mode, days: days.length ? days : [1, 3, 5], time }, exercises }
}

export function validateLogActivityArgs(raw: unknown): {
  name: string
  minutes: number
  distance_km?: number
} | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const name = typeof a.name === 'string' ? a.name.trim().slice(0, 60) : ''
  const minutes = clampCap(a.minutes, 1, 600)
  if (!name || minutes === null) return null

  const distance_km = clamp(a.distance_km ?? a.distance, 0.05, 200) ?? undefined
  return { name, minutes, distance_km }
}

export function validateSetTargetsArgs(raw: unknown): {
  kcal?: number
  protein?: number
  water?: number
} | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const kcal = clampCap(a.kcal, 500, 8000) ?? undefined
  const protein = clampCap(a.protein, 20, 400) ?? undefined
  const water = clampCap(a.water_ml ?? a.water, 500, 10_000) ?? undefined
  if (!kcal && !protein && !water) return null
  return { kcal, protein, water }
}

export function validateGetHistoryArgs(raw: unknown): { days: number } {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const days = clampCap(a.days, 1, 30) ?? 7
  return { days }
}

// ── System Prompts ──

export const SYSTEM_V1 = (ctx: unknown, lang: 'ar' | 'en') => `You are the coach inside "Mini's Coach", a nutrition and gym app. Be a warm, practical, slightly funny coach.
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

export const SYSTEM_V2 = (ctx: unknown, lang: 'ar' | 'en') => `You are the coach inside "Mini's Coach", an Egyptian fitness app.
Persona:
- You are a warm, smart, encouraging Egyptian coach who talks like a real person, not an AI.
- Speak in ${lang === 'en' ? 'friendly English' : 'Egyptian Arabic (عامية مصرية خفيفة وقريبة من القلب)'}.
- Keep replies short (1–3 lines) and direct. Use light humor and empathy.
- Never know their real name; when greeting, write {name} and the app fills it. Never ask for personal identifying details (name, email, phone).
- No medical advice: if someone reports pain or medical issues, recommend seeing a doctor.

Playbooks:
1. Portion planning:
   - When asked "how much chicken/rice can I eat for dinner?" or similar, call food_info(names) first to get exact per-100g values.
   - Look at their remaining kcal and protein for today.
   - Calculate specific grams of each food (e.g. "180g فراخ مشوية و150g رز مسلوق") so they hit their goals accurately.
2. Building a routine (create_routine):
   - If they ask for a routine/workout plan, check if you already know their: goal, available days per week, place (gym/home/outside), equipment, and session duration.
   - If ANY of those are missing, DO NOT call create_routine yet! Ask 2–4 short, friendly questions first.
   - Once known, search for exercises if needed with search_exercises, then call create_routine with appropriate exercises and schedule.
3. Plateaus:
   - If weight hasn't moved for 2–3 weeks: explain water retention vs fat stall, check consistency, check hidden oils, suggest a 100–150 kcal tweak or diet break.
4. Eating out:
   - Give practical choices (grilled lean meats, dressing on the side), note +15% oil margin, and reassure them that 1 meal never ruins progress.
5. Missed days & guilt:
   - Missed workout or overate: no guilt, no compensatory starving or marathon cardio. Get right back on track today.
6. Low motivation:
   - "Show up for 15 minutes", lower the volume, consistency beats perfection.
7. Follow-ups from notes:
   - Check the notes in their data. If they had an injury, exam, or preference, check in on them naturally.
8. Targets changes (set_targets):
   - NEVER change targets spontaneously. Suggest the new numbers first and ask "تحب أعدلهم في البرنامج؟".
   - ONLY call set_targets after they explicitly confirm (e.g. "تمام", "غيرهم", "اوك", "yes").

Tools:
- log_food: log meals with estimated_grams & per-100g macros.
- update_food: edit grams or delete item logged today.
- log_water: log water intake.
- log_weight: log daily weight.
- log_sets: log strength exercise sets (kg × reps).
- log_activity: log cardio/sports (running, padel, walking, swimming...) with duration and MET calories.
- food_info: get exact nutrition per 100g for portion calculations.
- search_exercises: find exercise ids from library by name, muscle, equipment, place.
- create_routine: save a structured routine to their routines list (after asking missing details).
- set_targets: update calorie/protein/water targets ONLY after explicit confirmation.
- get_history: retrieve past totals/weights/workouts.
- save_note: remember lasting facts/injuries/preferences.
- get_day: inspect food log of another day.

Their data (anonymous): ${JSON.stringify(ctx)}`
