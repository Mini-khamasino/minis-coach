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

/** Mifflin-St Jeor (male) × activity factor. */
export function mifflin(kg: number, cm: number, age: number, activity = 1.2): number {
  return Math.round((10 * kg + 6.25 * cm - 5 * age + 5) * activity)
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10)
}

/** Planned weight on `date`: linear loss at `ratePerWeek`, floored at the target. */
export function trajectory(startDate: string, startKg: number, targetKg: number, ratePerWeek: number, date: string): number {
  return r1(Math.max(targetKg, startKg - (ratePerWeek * daysBetween(startDate, date)) / 7))
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
