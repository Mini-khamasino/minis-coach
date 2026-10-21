import { db, today, type Settings } from './db.ts'
import type { Macros } from './foods.ts'
import { sum, addDays, trajectory, mifflin, adaptiveTdee, daysBetween, weightTrend } from './calc.ts'

const DAYS_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت']

const fmt = (m: Macros) => `${m.kcal} kcal · P${Math.round(m.p)} C${Math.round(m.c)} F${Math.round(m.f)}`

/** Compact computed history so the model never needs old chat ("graphify" card). */
export async function statusCard(s: Settings, date = today()): Promise<string> {
  const from = addDays(date, -35)
  const [items, water, weights, notes] = await Promise.all([
    db.items.where('date').aboveOrEqual(from).toArray(),
    db.water.where('date').aboveOrEqual(from).toArray(),
    db.weights.orderBy('date').toArray(),
    db.notes.toArray(),
  ])
  const dayTotals = (d: string) => sum(items.filter((i) => i.date === d))
  const dayWater = (d: string) => water.filter((w) => w.date === d).reduce((a, w) => a + w.ml, 0)
  const now = new Date()
  const lines: string[] = []

  lines.push(`الوقت: ${DAYS_AR[now.getDay()]} ${date} الساعة ${now.toTimeString().slice(0, 5)}`)
  lines.push(`الأهداف: ${s.goal} kcal (أخضر ≤${s.greenMax}، سقف الصيانة ${s.maintenance}) · بروتين ${s.protein}ج · مية ${s.waterGoal}مل`)

  const todayItems = items.filter((i) => i.date === date)
  lines.push(`\nالنهارده: ${fmt(dayTotals(date))} · مية ${dayWater(date)}مل`)
  for (const i of todayItems) lines.push(`  - ${i.meal}: ${i.name} ${i.grams}ج = ${i.kcal}`)

  lines.push('\nآخر 7 أيام:')
  let streak = 0
  let streakOpen = true
  for (let n = 1; n <= 7; n++) {
    const d = addDays(date, -n)
    if (d < s.startDate) break
    const t = dayTotals(d)
    if (t.kcal === 0) { lines.push(`  ${d.slice(5)}: مفيش تسجيل`); streakOpen = false; continue }
    lines.push(`  ${d.slice(5)}: ${fmt(t)} · مية ${dayWater(d)}`)
    if (streakOpen && t.kcal <= s.greenMax) streak++
    else streakOpen = false
  }
  lines.push(`streak أيام في الأخضر: ${streak}`)

  // older weeks as one line each
  for (let w = 1; w <= 4; w++) {
    const end = addDays(date, -7 * w - 1)
    const days = Array.from({ length: 7 }, (_, k) => dayTotals(addDays(end, -k)).kcal).filter((k) => k > 0)
    if (days.length) lines.push(`أسبوع لحد ${end.slice(5)}: متوسط ${Math.round(days.reduce((a, b) => a + b, 0) / days.length)} kcal (${days.length} أيام متسجلة)`)
  }

  const last = weights.at(-1)
  if (last) {
    const plan = trajectory(s.startDate, s.startKg, s.targetKg, s.ratePerWeek, last.date)
    const recent = weights.slice(-5).map((w) => `${w.date.slice(5)}:${w.kg}`).join(' ')
    lines.push(`\nالوزن: بدأ ${s.startKg} (${s.startDate}) · آخر ${last.kg} · نزل ${(s.startKg - last.kg).toFixed(1)} في ${daysBetween(s.startDate, last.date)} يوم · المسار المخطط ${plan} · الهدف ${s.targetKg}`)
    lines.push(`آخر وزنات: ${recent} · الـ trend الحالي ${weightTrend(weights).get(last.date)}`)
    if (last.date !== date) lines.push(`(لسه موزنش النهارده)`)
  }
  const intake = Array.from({ length: 22 }, (_, k) => { const d = addDays(date, -k); return { date: d, kcal: dayTotals(d).kcal } })
  const tdee = adaptiveTdee(intake, weights, date)
  lines.push(`الحرق: Mifflin ${mifflin(last?.kg ?? s.startKg, s.heightCm, s.age)}${tdee ? ` · الفعلي من البيانات ${tdee}` : ' · الفعلي لسه (محتاج 14 يوم تسجيل)'}`)

  lines.push('\nملاحظاتك عن ميني:')
  lines.push(notes.length ? notes.map((n) => `[${n.id}] ${n.text}`).join('\n') : '(لسه مفيش)')
  return lines.join('\n')
}
