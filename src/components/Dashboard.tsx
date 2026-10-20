import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ChevronLeft, Plus, Undo2, Sparkles, ArrowUp, CloudUpload } from 'lucide-react'
import { db, today, MEALS, type Item, type Settings } from '../lib/db.ts'
import { addDays, sum, zone, ZONE_COLOR } from '../lib/calc.ts'
import { sendToCoach } from '../lib/coach.ts'
import { daysSinceBackup } from '../lib/backup.ts'
import { Ring, Bar, toast, tick } from './ui.tsx'
import { WeightCard } from './WeightCard.tsx'
import { EditItem } from './EditItem.tsx'

const BOTTLE = 750

function dateLabel(d: string) {
  const t = today()
  if (d === t) return 'النهارده'
  if (d === addDays(t, -1)) return 'امبارح'
  return new Date(d).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function Dashboard({ s, theme, onSettings }: { s: Settings; theme: string; onSettings: () => void }) {
  const [date, setDate] = useState(today())
  const items = useLiveQuery(() => db.items.where('date').equals(date).sortBy('ts'), [date]) ?? []
  const water = useLiveQuery(() => db.water.where('date').equals(date).sortBy('ts'), [date]) ?? []
  const [editing, setEditing] = useState<Item | null>(null)

  const t = sum(items)
  const z = zone(t.kcal, s.greenMax, s.amberMax)
  const fatTarget = Math.round((s.goal * 0.3) / 9)
  const carbTarget = Math.round((s.goal - s.protein * 4 - fatTarget * 9) / 4)
  const ml = water.reduce((a, w) => a + w.ml, 0)
  const left = s.goal - t.kcal
  const backupAge = daysSinceBackup(s.lastBackup)
  const week = useLiveQuery(async () => {
    const days = new Map<string, number>()
    for (const i of await db.items.where('date').between(addDays(date, -7), date).toArray()) days.set(i.date, (days.get(i.date) ?? 0) + i.kcal)
    return days.size ? Math.round([...days.values()].reduce((a, b) => a + b, 0) / days.size) : null
  }, [date])

  return (
    <div className="flex flex-col gap-3">
      {(backupAge === null || backupAge >= 7) && (
        <button className="press card flex items-center gap-3 !py-3 text-start" onClick={onSettings}>
          <CloudUpload className="shrink-0 text-amber" size={22} />
          <span className="text-[14px]">{backupAge === null ? 'لسه معملتش باك أب على الدرايف' : `آخر باك أب من ${backupAge} يوم`} — <span className="text-blue">اعمل دلوقتي</span></span>
        </button>
      )}

      <QuickBar date={date} />

      <div className="flex items-center justify-between px-1">
        <button className="press rounded-full p-2 text-ink-2" onClick={() => setDate(addDays(date, -1))} aria-label="اليوم اللي فات"><ChevronRight size={22} /></button>
        <button className="press text-[17px] font-semibold" onClick={() => setDate(today())}>{dateLabel(date)}</button>
        <button className="press rounded-full p-2 text-ink-2 disabled:opacity-30" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))} aria-label="اليوم اللي بعده"><ChevronLeft size={22} /></button>
      </div>

      <section className="card flex items-center gap-5">
        <Ring value={t.kcal} max={s.goal} zone={z}>
          <span className="num text-[40px]" style={{ color: ZONE_COLOR[z] }}>{t.kcal}</span>
          <span className="text-[13px] text-ink-2">من {s.goal}</span>
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-[14px] text-ink-2">
            {left >= 0 ? <>فاضل <b className="num text-ink">{left}</b> سعر</> : t.kcal <= s.maintenance ? <>زيادة <b className="num text-amber">{-left}</b> · لسه تحت الصيانة</> : <>عديت الصيانة بـ <b className="num text-red">{t.kcal - s.maintenance}</b></>}
          </p>
          {week && <p className="-mt-2 text-[12px] text-ink-3">متوسط آخر 7 أيام: <span className="num">{week}</span></p>}
          <Bar label="بروتين" value={t.p} max={s.protein} color="#30D158" />
          <Bar label="كارب" value={t.c} max={carbTarget} color="#64D2FF" />
          <Bar label="دهون" value={t.f} max={fatTarget} color="#BF5AF2" />
        </div>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="label">المية</h2>
            <p className="num text-[28px] text-teal">{(ml / 1000).toFixed(2)}<span className="text-[15px] text-ink-2"> / {s.waterGoal / 1000} لتر</span></p>
          </div>
          <div className="flex gap-2">
            <button className="press rounded-full bg-fill p-2.5 text-ink-2 disabled:opacity-30" disabled={!water.length} aria-label="تراجع"
              onClick={() => db.water.delete(water.at(-1)!.id!)}><Undo2 size={20} /></button>
            <button className="press flex items-center gap-1 rounded-full bg-teal/20 px-3 py-2 text-teal" aria-label="زود 250 مل"
              onClick={() => { tick(); db.water.add({ date, ml: 250, ts: Date.now() }) }}><Plus size={18} />250</button>
          </div>
        </div>
        <div className="flex justify-between gap-3">
          {Array.from({ length: Math.round(s.waterGoal / BOTTLE) }, (_, i) => (
            <Bottle key={i} fill={Math.min(1, Math.max(0, (ml - i * BOTTLE) / BOTTLE))} onTap={() => { tick(); db.water.add({ date, ml: BOTTLE, ts: Date.now() }) }} />
          ))}
        </div>
      </section>

      <WeightCard s={s} theme={theme} />

      <section className="card">
        <h2 className="label mb-2">الأكل</h2>
        {!items.length && <p className="py-6 text-center text-ink-3">مفيش أكل متسجل — اكتب فوق أو كلم الكوتش</p>}
        {MEALS.map((m) => {
          const list = items.filter((i) => i.meal === m)
          if (!list.length) return null
          return (
            <div key={m} className="mb-2">
              <div className="flex justify-between py-1 text-[13px] text-ink-2"><span>{m}</span><span className="num">{sum(list).kcal}</span></div>
              {list.map((i) => (
                <button key={i.id} className="press flex w-full items-center gap-3 border-t border-hair py-2.5 text-start" onClick={() => setEditing(i)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px]">{i.name}</p>
                    <p className="text-[12px] text-ink-3">
                      <span className="num">{i.grams}</span>ج
                      {i.margin && <span className="ms-2 rounded bg-amber/15 px-1.5 text-amber">+15%</span>}
                      {i.estimated && <span className="ms-2 rounded bg-purple/15 px-1.5 text-purple">تقديري</span>}
                    </p>
                  </div>
                  <span className="num text-[17px]">{i.kcal}</span>
                </button>
              ))}
            </div>
          )
        })}
      </section>
      {editing && <EditItem item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Bottle({ fill, onTap }: { fill: number; onTap: () => void }) {
  return (
    <button className="press relative h-24 flex-1 overflow-hidden rounded-[14px_14px_18px_18px] border border-hair bg-fill" onClick={onTap} aria-label={`زجاجة ${Math.round(fill * 100)}% — دوس تزود 750 مل`}>
      <div className="absolute inset-x-0 bottom-0 bg-teal/70" style={{ height: `${fill * 100}%`, transition: 'height 600ms var(--ease-spring)' }} />
      <div className="absolute inset-x-[30%] top-0 h-2 rounded-b bg-ink-3" />
    </button>
  )
}

function QuickBar({ date }: { date: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    const v = text.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      const r = await sendToCoach(v, date)
      setText('')
      toast(r.toast || r.reply.slice(0, 80))
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="glass flex items-center gap-2 rounded-full py-1.5 ps-4 pe-1.5" onSubmit={(e) => { e.preventDefault(); send() }}>
      <Sparkles size={18} className={`shrink-0 text-purple ${busy ? 'animate-pulse' : ''}`} />
      <input className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-ink-3" placeholder="كلت إيه؟ مثلاً: 2 بيض ورغيف بلدي" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} aria-label="سجل أكل" />
      <button className="press grid size-9 shrink-0 place-items-center rounded-full bg-blue text-white disabled:opacity-30" disabled={!text.trim() || busy} aria-label="سجل"><ArrowUp size={20} /></button>
    </form>
  )
}
