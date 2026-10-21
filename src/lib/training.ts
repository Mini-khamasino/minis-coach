import type { Muscle } from 'react-body-highlighter'
import type { Workout } from './db.ts'
import { EXERCISES, e1rm, type Program } from './exercises.ts'

const doneSets = (w: Workout) => w.exercises.flatMap((e) => e.sets.filter((s) => s.done).map((s) => ({ exId: e.exId, ...s })))

/** Next day in the rotation: the one after the last finished workout of this program (rest days don't skip ahead). */
export function nextDayIndex(workouts: Workout[], program: Program): number {
  const last = workouts.filter((w) => w.endedAt && w.programId === program.id).sort((a, b) => b.startedAt - a.startedAt)[0]
  return last ? (last.dayIndex + 1) % program.days.length : 0
}

/** Muscles worked in finished workouts during the last 48 h (still recovering). */
export function recovering(workouts: Workout[], now: number): Muscle[] {
  const set = new Set<Muscle>()
  for (const w of workouts) {
    if (!w.endedAt || now - w.endedAt > 48 * 3600_000) continue
    for (const s of doneSets(w)) EXERCISES[s.exId]?.muscles.forEach((m) => set.add(m))
  }
  return [...set]
}

/** Hard sets per muscle over the last 7 days (an exercise counts for every muscle it trains). */
export function weeklySets(workouts: Workout[], now: number): Map<Muscle, number> {
  const out = new Map<Muscle, number>()
  for (const w of workouts) {
    if (now - w.startedAt > 7 * 86400_000) continue
    for (const s of doneSets(w)) for (const m of EXERCISES[s.exId]?.muscles ?? []) out.set(m, (out.get(m) ?? 0) + 1)
  }
  return out
}

/** Best set per exercise by estimated 1RM. */
export function personalRecords(workouts: Workout[]): Map<string, { kg: number; reps: number; e1rm: number; date: string }> {
  const out = new Map<string, { kg: number; reps: number; e1rm: number; date: string }>()
  for (const w of workouts) {
    for (const s of doneSets(w)) {
      if (!(s.kg > 0 && s.reps > 0)) continue
      const v = e1rm(s.kg, s.reps)
      if (v > (out.get(s.exId)?.e1rm ?? 0)) out.set(s.exId, { kg: s.kg, reps: s.reps, e1rm: v, date: w.date })
    }
  }
  return out
}

/** The person's last finished sets for an exercise — shown as "last time" targets. */
export function lastSets(workouts: Workout[], exId: string) {
  const prev = workouts.filter((w) => w.endedAt).sort((a, b) => b.startedAt - a.startedAt).find((w) => w.exercises.some((e) => e.exId === exId && e.sets.some((s) => s.done)))
  return prev?.exercises.find((e) => e.exId === exId)?.sets.filter((s) => s.done) ?? []
}
