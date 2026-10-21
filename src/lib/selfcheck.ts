// Run: npm test
import assert from 'node:assert/strict'
import { compute, sum, zone, mifflin, trajectory, adaptiveTdee, addDays, weightTrend, targetsFor } from './calc.ts'
import { FOODS } from './foods.ts'
import { parse, search } from './parser.ts'
import { PROGRAMS, suggestProgram, e1rm, workoutKcal } from './exercises.ts'
import { nextDayIndex, recovering, weeklySets, personalRecords, lastSets } from './training.ts'

// plain item: 200 g rice at 130/100 → 260
assert.deepEqual(compute(FOODS.rice, 200, false), { kcal: 260, p: 5.4, c: 56, f: 0.6 })
// +15% margin hits kcal and fat only: 200 g feteer 420 → 840 + 126 = 966, fat 52 + 14
const fe = compute(FOODS.feteer, 200, true)
assert.equal(fe.kcal, 966)
assert.equal(fe.p, 14)
assert.equal(fe.f, 66)
assert.equal(sum([fe, compute(FOODS.rice, 200, false)]).kcal, 1226)

assert.equal(zone(1850, 1850, 2500), 'green')
assert.equal(zone(1851, 1850, 2500), 'amber')
assert.equal(zone(2501, 1850, 2500), 'red')

assert.equal(mifflin(113.5, 177, 21), 2570)
assert.equal(trajectory('2026-10-17', 115, 85, 0.75, '2026-10-31'), 113.5)
assert.equal(trajectory('2026-10-17', 115, 85, 0.75, '2030-01-01'), 85)
assert.equal(trajectory('2026-10-17', 60, 65, 0.25, '2026-11-14'), 61) // bulk goes up
assert.equal(mifflin(60, 165, 25, 1.2, 'f'), 1614)

// Mini: maintenance 2570, cut −20% → 2050, protein from BMI-27 weight (84.6 kg × 2 ≈ 170)
const mini = targetsFor({ sex: 'm', age: 21, heightCm: 177, kg: 113.5, activity: 1.2, goalType: 'cut' })
assert.deepEqual(mini, { maintenance: 2570, goal: 2050, protein: 170, greenMax: 2150, amberMax: 2570, ratePerWeek: 0.45 })
// lean lifter bulking: protein uses real weight, surplus capped at 300
const lifter = targetsFor({ sex: 'm', age: 24, heightCm: 180, kg: 75, activity: 1.55, goalType: 'bulk' })
assert.equal(lifter.protein, 135)
assert.equal(lifter.goal - Math.round(lifter.maintenance / 50) * 50 <= 300, true)
// small woman cutting never goes under the 1200 floor
assert.equal(targetsFor({ sex: 'f', age: 30, heightCm: 150, kg: 50, activity: 1.2, goalType: 'cut' }).goal >= 1200, true)

// 21 days at 2000 kcal while losing 0.1 kg/day → 2000 + 770 = 2770
const today = '2026-12-01'
const intake = Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -21 + i), kcal: 2000 }))
const weights = Array.from({ length: 22 }, (_, i) => ({ date: addDays(today, -21 + i), kg: 110 - i * 0.1 }))
assert.equal(adaptiveTdee(intake, weights, today), 2770)
assert.equal(adaptiveTdee(intake.slice(0, 10), weights, today), null)

const tr = weightTrend([{ date: '2026-10-17', kg: 115 }, { date: '2026-10-18', kg: 114 }, { date: '2026-10-20', kg: 113.5 }])
assert.equal(tr.get('2026-10-18'), 114.9)
assert.ok(tr.get('2026-10-20')! > 113.5 && tr.get('2026-10-20')! < 114.9)


// ── parser ──
const mem = { phrases: {}, portions: {} }
const P = (s: string) => parse(s, [], mem).map((l) => [l.match?.key ?? null, l.grams, l.acc])
assert.deepEqual(P('2 بيض ورغيف بلدي'), [['egg', 100, 'p'], ['aish_baladi', 90, 'p']])
assert.deepEqual(P('بيضتين'), [['egg', 100, 'p']])
assert.deepEqual(P('200 جرام رز'), [['rice_egy', 200, 'w']])
assert.deepEqual(P('٢٠٠ج رز'), [['rice_egy', 200, 'w']])
assert.deepEqual(P('طبق كبسة'), [['kabsa', 450, 'p']])
assert.deepEqual(P('كوباية شاي ومعلقة عسل'), [['tea_sugar', 200, 'p'], ['honey', 20, 'p']])
assert.deepEqual(P('٣ تمرات'), [['dates', 30, 'p']])
assert.deepEqual(P('2 slices pizza, a coke'), [['pizza', 220, 'p'], ['soda', 330, 'p']])
assert.deepEqual(P('رغيفين'), [['aish_baladi', 180, 'p']])
assert.deepEqual(P('نص فرخة'), [['chicken', 125, 'p']])
// learning: a corrected phrase and a usual portion win next time
const learned = { phrases: { 'عيش': 'khubz' }, portions: { khubz: 60 } }
assert.equal(parse('عيش', [], learned)[0].match?.key, 'khubz')
assert.equal(parse('عيش', [], learned)[0].grams, 60)
// personal recipe beats the generic table
const myKabsa = { key: 'u:كبسة ماما', name: 'كبسة ماما', per100: { kcal: 160, p: 9, c: 18, f: 5.5 }, oily: false, foodId: null }
assert.equal(parse('كبسة ماما 300 جرام', [myKabsa], mem)[0].match?.key, 'u:كبسة ماما')

assert.equal(search('رز بسمتي', [], true)[0].key, 'raw_basmati') // recipe picker: raw first
assert.equal(search('رز بسمتي', [])[0].key, 'basmati') // logging: cooked

// ── training ──
const ppl = PROGRAMS.find((p) => p.id === 'ppl')!
const H = 3600_000, now0 = Date.parse('2026-10-21T18:00:00Z')
const wk = (dayIndex: number, hoursAgo: number, exId: string, kg: number, reps: number, done = true) =>
  ({ date: '2026-10-21', startedAt: now0 - hoursAgo * H, endedAt: now0 - hoursAgo * H + H, programId: 'ppl', dayIndex, exercises: [{ exId, sets: [{ kg, reps, done }] }] })
assert.equal(nextDayIndex([], ppl), 0)
assert.equal(nextDayIndex([wk(0, 50, 'bench', 60, 8), wk(1, 26, 'pullup', 0, 8)], ppl), 2) // after Pull comes Legs
assert.equal(nextDayIndex([wk(2, 5, 'squat', 80, 5)], ppl), 0) // wraps around
assert.deepEqual(recovering([wk(0, 50, 'bench', 60, 8), wk(2, 5, 'squat', 80, 5)], now0).sort(), ['adductor', 'gluteal', 'quadriceps'])
assert.equal(weeklySets([wk(0, 50, 'bench', 60, 8), wk(0, 30, 'bench', 60, 8, false)], now0).get('chest'), 1) // unfinished sets don't count
const prs = personalRecords([wk(0, 50, 'bench', 60, 10), wk(0, 5, 'bench', 70, 5)])
assert.equal(prs.get('bench')!.kg, 70) // 70×5 (e1RM 81.7) beats 60×10 (e1RM 80)
assert.equal(Math.round(e1rm(70, 5) * 10) / 10, 81.7)
assert.equal(lastSets([wk(0, 50, 'bench', 60, 10), wk(0, 5, 'bench', 70, 5)], 'bench')[0].kg, 70)
assert.equal(suggestProgram(4, 'gym').id, 'upper_lower')
assert.equal(suggestProgram(6, 'gym').id, 'ppl')
assert.equal(suggestProgram(3, 'home').id, 'home_full')
assert.equal(workoutKcal(60, 80), 400)

assert.ok(Object.keys(FOODS).length >= 150, `foods: ${Object.keys(FOODS).length}`)
console.log(`selfcheck ok — ${Object.keys(FOODS).length} foods`)
