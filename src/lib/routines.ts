// Routines & Workout scheduling logic
import { L } from './i18n.ts'
import type { Routine, RoutineExercise, Workout } from './db.ts'
import type { Program } from './exercises.ts'

export interface ScheduledSession {
  routine: Routine
  date: string
  time?: string
  isToday: boolean
}

/**
 * Find the next scheduled session from active routines.
 * Supports 'days' mode (specific days of week + time) and 'rotation' mode (sequential).
 */
export function nextSession(
  routines: Routine[],
  workouts: Workout[],
  nowMs: number = Date.now(),
): ScheduledSession | null {
  if (!routines.length) return null

  const now = new Date(nowMs)
  const todayDate = now.toLocaleDateString('en-CA') // YYYY-MM-DD
  const todayDow = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Check which routines have been done today
  const doneRoutineIdsToday = new Set(
    workouts
      .filter((w) => w.date === todayDate && w.endedAt && w.routineId)
      .map((w) => w.routineId!),
  )

  // 1. Check if any routine with 'days' schedule is scheduled for today and not yet done
  const daysRoutines = routines.filter((r) => r.schedule.mode === 'days' && r.schedule.days.length > 0)
  for (const r of daysRoutines) {
    if (r.schedule.days.includes(todayDow) && !doneRoutineIdsToday.has(r.id)) {
      return {
        routine: r,
        date: todayDate,
        time: r.schedule.time,
        isToday: true,
      }
    }
  }

  // 2. Check 'rotation' routines
  const rotationRoutines = routines.filter((r) => r.schedule.mode === 'rotation')
  if (rotationRoutines.length > 0) {
    // Find the last completed rotation workout
    const rotationIds = new Set(rotationRoutines.map((r) => r.id))
    const lastDone = workouts
      .filter((w) => w.endedAt && w.routineId && rotationIds.has(w.routineId))
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0]

    let nextIdx = 0
    if (lastDone) {
      const lastIdx = rotationRoutines.findIndex((r) => r.id === lastDone.routineId)
      if (lastIdx >= 0) {
        nextIdx = (lastIdx + 1) % rotationRoutines.length
      }
    }
    const nextRot = rotationRoutines[nextIdx]

    // If a rotation was completed today, next is scheduled for tomorrow (or next available)
    const isDoneToday = workouts.some(
      (w) => w.date === todayDate && w.endedAt && w.routineId && rotationIds.has(w.routineId),
    )

    if (!isDoneToday) {
      return {
        routine: nextRot,
        date: todayDate,
        time: nextRot.schedule.time,
        isToday: true,
      }
    }
  }

  // 3. Otherwise find the earliest upcoming day in 'days' routines (1 to 6 days ahead)
  let earliestSession: ScheduledSession | null = null
  let minDaysAhead = 8

  for (const r of daysRoutines) {
    for (const d of r.schedule.days) {
      const daysAhead = (d - todayDow + 7) % 7 || 7 // strictly future days (1..7)
      if (daysAhead < minDaysAhead) {
        minDaysAhead = daysAhead
        const targetDate = new Date(nowMs + daysAhead * 86400_000).toLocaleDateString('en-CA')
        earliestSession = {
          routine: r,
          date: targetDate,
          time: r.schedule.time,
          isToday: false,
        }
      }
    }
  }

  if (earliestSession) return earliestSession

  // Fallback to the first routine
  const fallback = routines[0]
  return {
    routine: fallback,
    date: todayDate,
    time: fallback.schedule.time,
    isToday: !doneRoutineIdsToday.has(fallback.id),
  }
}

/** Convert a Routine to a new active Workout */
export function routineToWorkout(routine: Routine, date?: string): Omit<Workout, 'id'> {
  const d = date || new Date().toLocaleDateString('en-CA')

  return {
    date: d,
    startedAt: Date.now(),
    programId: '',
    routineId: routine.id,
    dayIndex: 0,
    exercises: routine.exercises.map((rx) => {
      const exId = rx.ref.kind === 'legacy' ? rx.ref.id : `${rx.ref.kind}:${rx.ref.id}`
      return {
        exId,
        sets: Array.from({ length: rx.sets || 3 }, () => ({
          kg: rx.kg ?? 0,
          reps: rx.reps ?? 10,
          seconds: rx.seconds,
          meters: rx.meters,
          done: false,
        })),
      }
    }),
  }
}

/** Convert a built-in Program into editable Routine templates */
export function templateFromProgram(program: Program): Routine[] {
  const now = Date.now()

  return program.days.map((day, idx) => {
    const randomSuffix = Math.random().toString(36).slice(2, 8)
    const id = `rot_${program.id}_${idx}_${randomSuffix}`
    const exercises: RoutineExercise[] = day.slots.map(([exId, sets, repsStr]) => ({
      ref: { kind: 'legacy', id: exId },
      type: 'reps',
      sets,
      reps: parseInt(repsStr) || 8,
      kg: 0,
      restSec: 90,
    }))

    return {
      id,
      name: L(day.ar, day.en),
      schedule: {
        mode: 'rotation',
        days: [],
      },
      exercises,
      createdAt: now + idx,
      updatedAt: now + idx,
    }
  })
}
