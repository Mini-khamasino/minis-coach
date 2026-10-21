import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ChevronLeft, Sparkles, X, Star, Tag, CookingPot, BookMarked } from 'lucide-react'
import { db, today, MEALS, makeItem, type Item, type Meal, type Settings } from '../lib/db.ts'
import { addDays, compute, sum, zone, ZONE_COLOR } from '../lib/calc.ts'
import { parse, customCandidates, type ParsedLine, type ParserMemory, type Candidate } from '../lib/parser.ts'
import { L, lang, locale, MEAL_LABEL } from '../lib/i18n.ts'
import { Seg, toast } from './ui.tsx'
import { EditItem } from './EditItem.tsx'
import { FoodPicker, LabelSheet, RecipeSheet, MyFoods } from './FoodSheets.tsx'

const EMPTY_MEM: ParserMemory = { phrases: {}, portions: {} }
const ACC_BADGE = { w: '⚖️', p: '🍽️', l: '🏷️' } as const

function dateLabel(d: string) {
  const t = today()
  if (d === t) return L('النهارده', 'Today')
  if (d === addDays(t, -1)) return L('امبارح', 'Yesterday')
  return new Date(d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Meal by clock: before 11 breakfast, before 17 lunch, before 22 dinner, else snack. */
export const mealNow = (h = new Date().getHours()): Meal => (h < 4 ? 'سناك' : h < 11 ? 'فطار' : h < 17 ? 'غدا' : h < 22 ? 'عشا' : 'سناك')

export function Food({ s }: { s: Settings }) {
  const [date, setDate] = useState(today())
  const items = useLiveQuery(() => db.items.where('date').equals(date).sortBy('ts'), [date]) ?? []
  const [editing, setEditing] = useState<Item | null>(null)
  const [sheet, setSheet] = useState<'label' | 'recipe' | 'mine' | null>(null)
  const t = sum(items)
  const z = zone(t.kcal, s.greenMax, s.amberMax)

  return (
    <div className="flex flex-col gap-3">
      <SmartAdd date={date} />

      <div className="grid grid-cols-3 gap-2">
        <Chip icon={<BookMarked size={17} />} label={L('أكلي', 'My foods')} onClick={() => setSheet('mine')} />
        <Chip icon={<Tag size={17} />} label={L('منيو / ملصق', 'Menu / label')} onClick={() => setSheet('label')} />
        <Chip icon={<CookingPot size={17} />} label={L('وصفة', 'Recipe')} onClick={() => setSheet('recipe')} />
      </div>

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
        {!items.length && <p className="py-6 text-center text-ink-3">{L('مفيش أكل متسجل — اكتب فوق زي ما بتتكلم', 'Nothing logged — type above like you talk')}</p>}
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
                      {i.perServing ? <span className="num">{i.grams / 100}×</span> : <><span className="num">{i.grams}</span>{L('ج', 'g')}</>}
                      {i.acc && <span className="ms-2" title={{ w: L('موزون', 'weighed'), p: L('حصة تقديرية', 'estimated portion'), l: L('من الملصق/المنيو', 'from label/menu') }[i.acc]}>{ACC_BADGE[i.acc]}</span>}
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
        {items.length > 0 && <p className="pt-2 text-center text-[11px] text-ink-3">⚖️ {L('موزون', 'weighed')} · 🍽️ {L('حصة تقديرية', 'estimated portion')} · 🏷️ {L('ملصق/منيو', 'label/menu')}</p>}
      </section>

      {editing && <EditItem item={editing} onClose={() => setEditing(null)} />}
      {sheet === 'label' && <LabelSheet date={date} meal={mealNow()} onClose={() => setSheet(null)} />}
      {sheet === 'recipe' && <RecipeSheet onClose={() => setSheet(null)} />}
      {sheet === 'mine' && <MyFoods date={date} meal={mealNow()} onClose={() => setSheet(null)} />}
    </div>
  )
}

const Chip = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button className="press surface flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[13px] font-medium" onClick={onClick}>{icon}{label}</button>
)

type Line = ParsedLine & { edited?: boolean; picked?: boolean }

/** Type like you talk ("2 بيض ورغيف وكوباية شاي") → instant, editable preview → log. No AI. */
function SmartAdd({ date }: { date: string }) {
  const [text, setText] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [meal, setMeal] = useState<Meal>(mealNow())
  const [picking, setPicking] = useState<number | null>(null)
  const [saveAs, setSaveAs] = useState<string | null>(null)
  const customs = useLiveQuery(() => db.customFoods.toArray()) ?? []
  const mem = (useLiveQuery(() => db.kv.get('parserMemory'))?.value as ParserMemory | undefined) ?? EMPTY_MEM
  const candidates = useMemo(() => customCandidates(customs), [customs])

  const onText = (v: string) => {
    setText(v)
    setLines(v.trim().length >= 2 ? parse(v, candidates, mem) : [])
    if (!v.trim()) setMeal(mealNow())
  }
  const setLine = (k: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === k ? { ...l, ...patch } : l)))
  const ready = lines.filter((l) => l.match && l.grams > 0)
  const total = sum(ready.map((l) => compute(l.match!.per100, l.grams, l.match!.oily)))

  const log = async () => {
    if (!ready.length) return
    await db.items.bulkAdd(ready.map((l) => ({ ...makeItem(date, meal, l.match!.name, l.match!.foodId, l.grams, l.match!.per100, l.match!.oily, false), acc: l.acc })))
    // learn: corrected food for this wording, and the grams this person actually eats
    const next: ParserMemory = { phrases: { ...mem.phrases }, portions: { ...mem.portions } }
    for (const l of ready) {
      if (l.picked && l.phrase) next.phrases[l.phrase] = l.match!.key
      if (l.edited) next.portions[l.match!.key] = l.grams
    }
    await db.kv.put({ key: 'parserMemory', value: next })
    if (saveAs?.trim()) {
      await db.meals.add({ name: saveAs.trim(), items: ready.map((l) => ({ name: l.match!.name, foodId: l.match!.foodId, per100: l.match!.per100, grams: l.grams, margin: l.match!.oily })) })
    }
    toast(`✅ ${ready.length > 1 ? L(`${ready.length} أصناف`, `${ready.length} items`) : ready[0].match!.name} · ${total.kcal} kcal`)
    setText(''); setLines([]); setSaveAs(null); setMeal(mealNow())
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="surface flex items-center gap-2 rounded-[22px] px-4 py-1.5">
        <Sparkles size={18} className="shrink-0 text-accent" />
        <input className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-ink-3" placeholder={L('كلت إيه؟ "2 بيض ورغيف وكوباية شاي"', 'What did you eat? "2 eggs, a pita and tea"')}
          value={text} onChange={(e) => onText(e.target.value)} aria-label={L('اكتب أكلك', 'Type your food')} enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && log()} />
        {text && <button className="press p-1 text-ink-3" onClick={() => onText('')} aria-label={L('امسح', 'Clear')}><X size={18} /></button>}
      </div>

      {lines.length > 0 && (
        <section className="card pop-enter !p-3">
          {lines.map((l, k) => (
            <div key={k} className="flex items-center gap-2 border-b border-hair py-2 last:border-0">
              <button className="press min-w-0 flex-1 text-start" onClick={() => setPicking(k)}>
                {l.match
                  ? <span className="block truncate text-[15px] underline decoration-ink-3 decoration-dotted underline-offset-4">{l.match.name}</span>
                  : <span className="block truncate text-[15px] text-amber">"{l.phrase || l.text}" — {L('اختار', 'pick')} ▾</span>}
                <span className="text-[11px] text-ink-3">{ACC_BADGE[l.acc]} {l.text}</span>
              </button>
              <input className="field num w-[72px] !px-2 !py-1.5 text-center" inputMode="decimal" value={l.grams || ''} aria-label={L('جرام', 'grams')}
                onChange={(e) => setLine(k, { grams: Number(e.target.value) || 0, edited: true, acc: 'w' })} />
              <span className="num w-11 text-end text-[15px]">{l.match ? compute(l.match.per100, l.grams, l.match.oily).kcal : '—'}</span>
              <button className="press p-1 text-ink-3" onClick={() => setLines(lines.filter((_, j) => j !== k))} aria-label={L('شيل', 'Remove')}><X size={16} /></button>
            </div>
          ))}
          <div className="mt-3 mb-2"><Seg value={meal} onChange={setMeal} options={MEALS.map((m) => [m, MEAL_LABEL[m]] as [Meal, string])} /></div>
          {saveAs !== null && (
            <input className="field mb-2" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} placeholder={L('اسم الوجبة (مثلاً: فطاري المعتاد)', 'Meal name (e.g. My usual breakfast)')} autoFocus />
          )}
          <div className="flex gap-2">
            <button className="press flex-1 rounded-2xl bg-accent py-3 font-semibold text-white disabled:opacity-40" disabled={!ready.length} onClick={log}>
              {L('سجّل', 'Log')} · <span className="num">{total.kcal}</span>
            </button>
            {ready.length > 1 && saveAs === null && (
              <button className="press rounded-2xl bg-fill px-4 text-amber" onClick={() => setSaveAs('')} aria-label={L('احفظها كوجبة', 'Save as meal')}><Star size={20} /></button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-3">{L('دوس على الاسم تغيّره · الجرامات لو وزنت أدق ⚖️', 'Tap a name to change it · weighed grams are most accurate ⚖️')}</p>
        </section>
      )}
      {picking !== null && (
        <FoodPicker onClose={() => setPicking(null)} onPick={(c: Candidate) => {
          const l = lines[picking]
          // keep grams the person typed; otherwise switch to the new food's own serving
          const grams = l.acc === 'w' ? l.grams : c.serving?.[0] ?? l.grams
          setLine(picking, { match: c, picked: true, grams })
        }} />
      )}
    </div>
  )
}
