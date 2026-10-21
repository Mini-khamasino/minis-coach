import type { Macros } from './foods.ts'

export const MARGIN = 0.15
const DAY = 86_400_000

const r1 = (n: number) => Math.round(n * 10) / 10

/** Item totals from per-100 g values. The +15% margin is hidden cooking fat, so it lands on kcal and fat only. */
export function compute(per100: Macros, grams: number, margin: boolean): Macros {
  const k = grams / 100
  const base = per100.kcal * k
  const extra = margin ? base * MARGIN : 0
  return {
    kcal: Math.round(base + extra),
    p: r1(per100.p * k),
    c: r1(per100.c * k),
    f: r1(per100.f * k + extra / 9),
  }
}

export function sum(items: Macros[]): Macros {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { kcal: 0, p: 0, c: 0, f: 0 })
  return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) }
}

export type Zone = 'green' | 'amber' | 'red'
export const ZONE_COLOR: Record<Zone, string> = { green: '#30D158', amber: '#FF9F0A', red: '#FF453A' }

export function zone(kcal: number, greenMax: number, amberMax: number): Zone {
  return kcal <= greenMax ? 'green' : kcal <= amberMax ? 'amber' : 'red'
}

/** Mifflin-St Jeor × activity factor. */
export function mifflin(kg: number, cm: number, age: number, activity = 1.2, sex: 'm' | 'f' = 'm'): number {
  return Math.round((10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161)) * activity)
}

const round = (n: number, step: number) => Math.round(n / step) * step

/** Onboarding calculator: maintenance, daily goal, gym-style protein, ring zones and weekly pace. */
export function targetsFor(p: { sex: 'm' | 'f'; age: number; heightCm: number; kg: number; activity: number; goalType: 'cut' | 'maintain' | 'bulk' }) {
  const maintenance = mifflin(p.kg, p.heightCm, p.age, p.activity, p.sex)
  const floor = p.sex === 'f' ? 1200 : 1500
  const goal =
    p.goalType === 'cut' ? Math.max(floor, round(maintenance - Math.min(maintenance * 0.2, 750), 50))
    : p.goalType === 'bulk' ? round(maintenance + Math.min(maintenance * 0.1, 300), 50)
    : round(maintenance, 50)
  // protein from a BMI-27 reference weight, so heavy bodies don't get absurd targets
  const refKg = Math.min(p.kg, 27 * (p.heightCm / 100) ** 2)
  const protein = round(refKg * (p.goalType === 'cut' ? 2 : 1.8), 5)
  return {
    maintenance,
    goal,
    protein,
    // shortcut: zones only flag eating too much; under-eating on a bulk isn't colored, add a lower band if bulkers need it
    greenMax: goal + (p.goalType === 'bulk' ? 250 : 100),
    amberMax: p.goalType === 'cut' ? maintenance : goal + (p.goalType === 'bulk' ? 600 : 300),
    ratePerWeek: round((Math.abs(goal - maintenance) * 7) / 7700, 0.05),
  }
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10)
}

/** Planned weight on `date`: linear change at `ratePerWeek` toward the target (down for a cut, up for a bulk), stopping there. */
export function trajectory(startDate: string, startKg: number, targetKg: number, ratePerWeek: number, date: string): number {
  const moved = (ratePerWeek * daysBetween(startDate, date)) / 7
  return r1(targetKg < startKg ? Math.max(targetKg, startKg - moved) : Math.min(targetKg, startKg + moved))
}

/**
 * Smoothed trend weight (Hacker's Diet EMA, 10%/day), so daily water swings don't matter.
 * Gaps between weigh-ins are decayed day by day.
 */
export function weightTrend(weights: { date: string; kg: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  let t: number | null = null
  let prev = ''
  for (const w of weights) {
    if (t === null) t = w.kg
    else t = w.kg + (t - w.kg) * 0.9 ** Math.max(1, daysBetween(prev, w.date))
    prev = w.date
    out.set(w.date, r1(t))
  }
  return out
}

/**
 * Adaptive TDEE (MacroFactor-style): average intake minus the energy implied by the weight trend.
 * Uses the `window` days before `today` (today is still being eaten). Needs ≥14 logged days and ≥3 weigh-ins.
 */
export function adaptiveTdee(
  intake: { date: string; kcal: number }[],
  weights: { date: string; kg: number }[],
  today: string,
  window = 21,
): number | null {
  const from = addDays(today, -window)
  const inWin = (d: string) => d >= from && d < today
  const days = intake.filter((d) => inWin(d.date) && d.kcal > 0)
  const ws = weights.filter((w) => inWin(w.date) || w.date === today)
  if (days.length < 14 || ws.length < 3) return null

  // least-squares slope, kg per day
  const xs = ws.map((w) => daysBetween(from, w.date))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ws.reduce((a, w) => a + w.kg, 0) / ws.length
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  if (den === 0) return null
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ws[i].kg - my), 0) / den

  const avg = days.reduce((a, d) => a + d.kcal, 0) / days.length
  return Math.round(avg - slope * 7700)
}
