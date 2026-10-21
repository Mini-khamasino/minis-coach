import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ChevronLeft, Search } from 'lucide-react'
import { db, today, MEALS, makeItem, type Item, type Meal, type Settings } from '../lib/db.ts'
import { FOODS, type Macros } from '../lib/foods.ts'
import { addDays, sum, zone, ZONE_COLOR } from '../lib/calc.ts'
import { L, lang, locale, MEAL_LABEL } from '../lib/i18n.ts'
import { EditItem } from './EditItem.tsx'

function dateLabel(d: string) {
  const t = today()
  if (d === t) return L('النهارده', 'Today')
  if (d === addDays(t, -1)) return L('امبارح', 'Yesterday')
  return new Date(d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
}

export function Food({ s }: { s: Settings }) {
  const [date, setDate] = useState(today())
  const items = useLiveQuery(() => db.items.where('date').equals(date).sortBy('ts'), [date]) ?? []
  const [editing, setEditing] = useState<Item | null>(null)
  const t = sum(items)
  const z = zone(t.kcal, s.greenMax, s.amberMax)

  return (
    <div className="flex flex-col gap-3">
      <QuickBar date={date} />

      <div className="flex items-center justify-between px-1">
        <button className="press rounded-full p-2 text-ink-2" onClick={() => setDate(addDays(date, -1))} aria-label={L('اليوم اللي فات', 'Previous day')}>
          {lang === 'ar' ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
        </button>
        <button className="press text-center" onClick={() => setDate(today())}>
          <span className="block text-[17px] font-semibold">{dateLabel(date)}</span>
          <span className="num text-[13px]" style={{ color: ZONE_COLOR[z] }}>{t.kcal}</span>
          <span className="text-[13px] text-ink-3"> / {s.goal} · P {Math.round(t.p)}</span>
        </button>
        <button className="press rounded-full p-2 text-ink-2 disabled:opacity-30" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))} aria-label={L('اليوم اللي بعده', 'Next day')}>
          {lang === 'ar' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
        </button>
      </div>

      <section className="card">
        {!items.length && <p className="py-6 text-center text-ink-3">{L('مفيش أكل متسجل — دوّر فوق', 'Nothing logged — search above')}</p>}
        {MEALS.map((m) => {
          const list = items.filter((i) => i.meal === m)
          if (!list.length) return null
          return (
            <div key={m} className="mb-2">
              <div className="flex justify-between py-1 text-[13px] text-ink-2"><span>{MEAL_LABEL[m]}</span><span className="num">{sum(list).kcal}</span></div>
              {list.map((i) => (
                <button key={i.id} className="press flex w-full items-center gap-3 border-t border-hair py-2.5 text-start" onClick={() => setEditing(i)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px]">{i.name}</p>
                    <p className="text-[12px] text-ink-3">
                      <span className="num">{i.grams}</span>{L('ج', 'g')}
                      {i.margin && <span className="ms-2 rounded bg-amber/15 px-1.5 text-amber">+15%</span>}
                      {i.estimated && <span className="ms-2 rounded bg-purple/15 px-1.5 text-purple">{L('تقديري', 'estimate')}</span>}
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

const norm = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').toLowerCase()

/** 0 = name starts with the query, 1 = some word does, 2 = only contains it. */
const rank = (name: string, q: string) => (norm(name).startsWith(q) ? 0 : norm(name).split(' ').some((w) => w.startsWith(q.split(' ')[0])) ? 1 : 2)

/** Meal by clock: before 11 breakfast, before 17 lunch, before 22 dinner, else snack. */
export const mealNow = (h = new Date().getHours()): Meal => (h < 4 ? 'سناك' : h < 11 ? 'فطار' : h < 17 ? 'غدا' : h < 22 ? 'عشا' : 'سناك')

/** Typing searches the local food table instantly; Enter picks the top match. */
function QuickBar({ date }: { date: string }) {
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<Item | null>(null)
  const customs = useLiveQuery(() => db.customFoods.toArray()) ?? []

  const q = norm(text.trim())
  const matches = q.length < 2 ? [] : [
    ...customs.map((c) => ({ id: null, name: c.name, per100: c.per100, oily: false })),
    ...Object.values(FOODS).map((f) => ({ id: f.id, name: f.name, per100: f as Macros, oily: f.oily })),
  ].filter((f) => q.split(/\s+/).every((w) => norm(f.name).includes(w)))
    // word-start matches first: "بيض" → eggs before "رز أبيض"
    .sort((a, b) => rank(a.name, q) - rank(b.name, q))
    .slice(0, 6)

  const pick = (f: (typeof matches)[number]) => {
    const per100 = { kcal: f.per100.kcal, p: f.per100.p, c: f.per100.c, f: f.per100.f }
    setDraft(makeItem(date, mealNow(), f.name, f.id, 100, per100, f.oily, false))
  }
  return (
    <div className="relative">
      <form className="glass flex items-center gap-2 rounded-full px-4 py-1.5" onSubmit={(e) => { e.preventDefault(); if (matches[0]) pick(matches[0]) }}>
        <Search size={18} className="shrink-0 text-ink-3" />
        <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-3" placeholder={L('كلت إيه؟', 'What did you eat?')}
          value={text} onChange={(e) => setText(e.target.value)} aria-label={L('دوّر على أكل', 'Search food')} enterKeyHint="search" />
      </form>
      {matches.length > 0 && (
        <ul className="glass pop-enter absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl" role="listbox" aria-label={L('أكلات', 'Foods')}>
          {matches.map((f) => (
            <li key={f.id ?? `u:${f.name}`}>
              <button className="press flex w-full items-center justify-between border-b border-hair px-4 py-2.5 text-start last:border-0" onClick={() => pick(f)}>
                <span className="truncate">{f.name}{!f.id && <span className="ms-2 text-[12px] text-purple">{L('أكلك', 'yours')}</span>}</span>
                <span className="num shrink-0 text-[13px] text-ink-3">{f.per100.kcal}/100{L('ج', 'g')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft && <EditItem item={draft} onClose={() => { setDraft(null); setText('') }} />}
    </div>
  )
}
