// Run: npm test
import assert from 'node:assert/strict'
import { compute, sum, zone, mifflin, trajectory, adaptiveTdee, addDays, weightTrend } from './calc.ts'
import { FOODS } from './foods.ts'
import { thinkingFor } from './coach.ts'

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

// 21 days at 2000 kcal while losing 0.1 kg/day → 2000 + 770 = 2770
const today = '2026-12-01'
const intake = Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -21 + i), kcal: 2000 }))
const weights = Array.from({ length: 22 }, (_, i) => ({ date: addDays(today, -21 + i), kg: 110 - i * 0.1 }))
assert.equal(adaptiveTdee(intake, weights, today), 2770)
assert.equal(adaptiveTdee(intake.slice(0, 10), weights, today), null)

const tr = weightTrend([{ date: '2026-10-17', kg: 115 }, { date: '2026-10-18', kg: 114 }, { date: '2026-10-20', kg: 113.5 }])
assert.equal(tr.get('2026-10-18'), 114.9)
assert.ok(tr.get('2026-10-20')! > 113.5 && tr.get('2026-10-20')! < 114.9)

assert.deepEqual(thinkingFor('gemini-3.5-flash'), { thinkingLevel: 'low' })
assert.deepEqual(thinkingFor('gemini-flash-latest'), { thinkingLevel: 'low' })
assert.deepEqual(thinkingFor('gemini-2.5-flash'), { thinkingBudget: 0 })
assert.equal(thinkingFor('gemini-2.0-flash'), undefined)
assert.deepEqual(thinkingFor('gemini-3.1-flash-lite'), { thinkingLevel: 'minimal' })

assert.ok(Object.keys(FOODS).length >= 150, `foods: ${Object.keys(FOODS).length}`)
console.log(`selfcheck ok — ${Object.keys(FOODS).length} foods`)
