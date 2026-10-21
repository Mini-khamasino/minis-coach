import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db, today, type Settings } from '../lib/db.ts'
import { addDays, daysBetween, trajectory, adaptiveTdee, mifflin, weightTrend } from '../lib/calc.ts'
import { Sheet, toast } from './ui.tsx'
import { L, lang } from '../lib/i18n.ts'


export function WeightCard({ s, theme }: { s: Settings; theme: string }) {
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray()) ?? []
  const intake = useLiveQuery(async () => {
    const from = addDays(today(), -22)
    const items = await db.items.where('date').aboveOrEqual(from).toArray()
    const m = new Map<string, number>()
    for (const i of items) m.set(i.date, (m.get(i.date) ?? 0) + i.kcal)
    return [...m].map(([date, kcal]) => ({ date, kcal }))
  }) ?? []
  const canvas = useRef<HTMLCanvasElement>(null)
  const [adding, setAdding] = useState(false)

  const last = weights.at(-1)
  const tdee = adaptiveTdee(intake, weights, today())
  const trend = weightTrend(weights)
  // trend lags with few points; headline the scale until a week of weigh-ins
  const useTrend = weights.length >= 7
  const shown = last ? (useTrend ? trend.get(last.date)! : last.kg) : undefined

  useEffect(() => {
    if (!canvas.current) return
    const end = addDays(last && last.date > today() ? last.date : today(), 14)
    const n = Math.max(1, daysBetween(s.startDate, end))
    const labels = Array.from({ length: n + 1 }, (_, i) => addDays(s.startDate, i))
    const byDate = new Map(weights.map((w) => [w.date, w.kg]))
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const css = getComputedStyle(document.documentElement)
    const muted = css.getPropertyValue('--color-ink-3').trim()
    const hair = css.getPropertyValue('--color-hair').trim()
    const accent = css.getPropertyValue('--color-teal').trim()
    // chart.js loads only when the chart is drawn
    let chart: { destroy(): void } | undefined
    let alive = true
    const el = canvas.current
    import('chart.js').then(({ Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip }) => {
      if (!alive) return
      Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)
      chart = new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: L('المتوسط', 'Trend'),
              data: labels.map((d) => trend.get(d) ?? null),
              borderColor: accent,
              spanGaps: true,
              tension: 0.35,
              pointRadius: 0,
              borderWidth: 2.5,
            },
            {
              label: L('الميزان', 'Scale'),
              data: labels.map((d) => byDate.get(d) ?? null),
              borderColor: 'transparent',
              pointRadius: 3,
              pointBackgroundColor: muted,
              showLine: false,
            },
            {
              label: L('المسار', 'Plan'),
              data: labels.map((d) => trajectory(s.startDate, s.startKg, s.targetKg, s.ratePerWeek, d)),
              borderColor: muted,
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1.5,
            },
          ],
        },
        options: {
          animation: reduce ? false : { duration: 600, easing: 'easeOutQuart' },
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { tooltip: { rtl: lang === 'ar', displayColors: false } },
          scales: {
            x: { ticks: { color: muted, maxTicksLimit: 5, callback: (_, i) => labels[i].slice(5) }, grid: { display: false } },
            y: { position: lang === 'ar' ? 'right' : 'left', ticks: { color: muted, maxTicksLimit: 4 }, grid: { color: hair } },
          },
        },
      })
    })
    return () => { alive = false; chart?.destroy() }
  }, [weights, s.startDate, s.startKg, s.targetKg, s.ratePerWeek, last, theme])

  return (
    <section className="card">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="label">{L('الوزن', 'Weight')}</h2>
          <p className="num text-[34px]">{shown?.toFixed(1) ?? '—'}<span className="text-[15px] text-ink-2"> {L('كجم', 'kg')}{useTrend ? L(' متوسط', ' trend') : ''}</span></p>
          {last && shown && (
            <p className="text-[13px] text-ink-2">
              {useTrend && <>{L('الميزان', 'Scale')} <b className="num">{last.kg.toFixed(1)}</b> · </>}{L('اتغير', 'Change')} <b className="num text-green">{(shown - s.startKg > 0 ? '+' : '') + (shown - s.startKg).toFixed(1)}</b> · {L('فاضل', 'To go')} <b className="num">{Math.abs(shown - s.targetKg).toFixed(1)}</b>
            </p>
          )}
        </div>
        <button className="press flex items-center gap-1 rounded-full bg-fill px-3 py-1.5 text-[14px] text-teal" onClick={() => setAdding(true)}>
          <Plus size={16} /> {L('وزن', 'Weigh')}
        </button>
      </div>
      <div className="h-44"><canvas ref={canvas} aria-label={L('رسم الوزن الفعلي مقابل المسار المخطط', 'Actual weight vs planned path')} role="img" /></div>
      <p className="mt-2 text-[12px] text-ink-3">
        {L('الحرق المتوقع', 'Estimated burn')} {mifflin(last?.kg ?? s.startKg, s.heightCm, s.age, s.activity, s.sex)}
        {tdee ? L(` · الفعلي ${tdee}`, ` · actual ${tdee}`) : L(' · الفعلي بيتحسب بعد أسبوعين تسجيل', ' · actual after 2 weeks of logging')}
      </p>
      {last?.date !== today() && new Date().getHours() < 14 && (
        <button className="press mt-3 w-full rounded-xl bg-teal/15 py-2.5 text-[14px] text-teal" onClick={() => setAdding(true)}>
          {L('⚖️ اوزن نفسك دلوقتي — بعد الحمام وقبل الأكل', '⚖️ Weigh in now — after the bathroom, before eating')}
        </button>
      )}
      {adding && <AddWeight last={last?.kg} onClose={() => setAdding(false)} />}
    </section>
  )
}

function AddWeight({ last, onClose }: { last?: number; onClose: () => void }) {
  const [kg, setKg] = useState(last ? String(last) : '')
  const [date, setDate] = useState(today())
  const save = async () => {
    const v = Number(kg)
    if (!(v > 30 && v < 300)) return toast(L('وزن مش منطقي', 'That weight looks wrong'))
    await db.weights.put({ date, kg: Math.round(v * 10) / 10 })
    toast(L(`⚖️ ${v} كجم اتسجل`, `⚖️ ${v} kg logged`))
    onClose()
  }
  return (
    <Sheet title={L('وزن جديد', 'New weigh-in')} onClose={onClose}>
      <label className="label">{L('الوزن (كجم)', 'Weight (kg)')}</label>
      <input className="field num mb-3 text-[28px]" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus />
      <label className="label">{L('التاريخ', 'Date')}</label>
      <input className="field mb-5" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <p className="mb-4 text-[13px] text-ink-3">{L('كل يوم الصبح، نفس الظروف. التطبيق بيحسب المتوسط فمتقلقش لو الميزان طلع زيادة يوم.', 'Every morning, same conditions. The app tracks the trend, so one high day is fine.')}</p>
      <button className="press w-full rounded-2xl bg-accent text-white py-3 font-semibold" onClick={save}>{L('حفظ', 'Save')}</button>
    </Sheet>
  )
}
