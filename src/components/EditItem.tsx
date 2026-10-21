import { useState } from 'react'
import { Trash2, Repeat } from 'lucide-react'
import { db, MEALS, today, makeItem, type Item, type Meal } from '../lib/db.ts'
import { compute } from '../lib/calc.ts'
import { Sheet, toast } from './ui.tsx'
import { L, MEAL_LABEL } from '../lib/i18n.ts'

/** Edit grams + per-100 g values. Changed per-100 values are remembered as Mini's own food. */
export function EditItem({ item, onClose }: { item: Item; onClose: () => void }) {
  const [name, setName] = useState(item.name)
  const [meal, setMeal] = useState<Meal>(item.meal)
  const [grams, setGrams] = useState(String(item.grams))
  const [per, setPer] = useState({ kcal: String(item.per100.kcal), p: String(item.per100.p), c: String(item.per100.c), f: String(item.per100.f) })
  const [margin, setMargin] = useState(item.margin)

  const per100 = { kcal: Number(per.kcal) || 0, p: Number(per.p) || 0, c: Number(per.c) || 0, f: Number(per.f) || 0 }
  const g = Number(grams) || 0
  const total = compute(per100, g, margin)
  const per100Changed = (['kcal', 'p', 'c', 'f'] as const).some((k) => per100[k] !== item.per100[k])

  const save = async () => {
    if (!(g > 0 && g <= 5000)) return toast(L('الجرامات غلط', 'Check the grams'))
    if (per100.kcal > 950) return toast(L('مفيش أكل أكتر من 950 سعر في 100 جرام', 'No food has over 950 kcal per 100 g'))
    const learned = per100Changed || item.estimated
    await db.transaction('rw', db.items, db.customFoods, async () => {
      const fields = { name, meal, grams: g, per100, margin, estimated: false, ...total }
      if (item.id) await db.items.update(item.id, fields)
      else await db.items.add({ ...item, ...fields, ts: Date.now() })
      if (learned) await db.customFoods.put({ name: name.trim(), per100 })
    })
    toast(learned ? L(`💾 "${name}" اتحفظ في أكلك`, `💾 "${name}" saved to your foods`) : item.id ? L('✅ اتعدل', '✅ Updated') : `✅ ${name} · ${total.kcal} kcal`)
    onClose()
  }
  const again = async () => {
    await db.items.add(makeItem(today(), meal, name, item.foodId, g, per100, margin, false))
    toast(L(`🔁 ${name} اتسجل النهارده`, `🔁 ${name} logged today`))
    onClose()
  }
  const remove = async () => {
    await db.items.delete(item.id!)
    toast(L(`🗑️ اتمسح: ${item.name}`, `🗑️ Deleted: ${item.name}`))
    onClose()
  }

  const num = (k: keyof typeof per, label: string) => (
    <label className="flex-1">
      <span className="label">{label}</span>
      <input className="field num mt-1 text-center" inputMode="decimal" value={per[k]} onChange={(e) => setPer({ ...per, [k]: e.target.value })} />
    </label>
  )

  return (
    <Sheet title={item.id ? L('تعديل', 'Edit') : L('إضافة', 'Add')} onClose={onClose}>
      <input className="field mb-3 text-[17px] font-medium" value={name} onChange={(e) => setName(e.target.value)} aria-label={L('الاسم', 'Name')} />
      <div className="mb-3 flex gap-2" role="radiogroup" aria-label={L('الوجبة', 'Meal')}>
        {MEALS.map((m) => (
          <button key={m} role="radio" aria-checked={meal === m} className={`press flex-1 rounded-xl py-2 text-[14px] ${meal === m ? 'bg-accent font-semibold text-white' : 'bg-fill text-ink-2'}`} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</button>
        ))}
      </div>
      <label className="label">{L('الكمية (جرام / مل)', 'Amount (g / ml)')}</label>
      <input className="field num mb-2 mt-1 text-[24px]" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus={!item.id} onFocus={(e) => e.target.select()} />
      <div className="mb-4 flex gap-2">
        {[50, 100, 150, 200, 300].map((n) => (
          <button key={n} className={`press num flex-1 rounded-lg py-1.5 text-[14px] ${g === n ? 'bg-accent text-white' : 'bg-fill text-ink-2'}`} onClick={() => setGrams(String(n))}>{n}</button>
        ))}
      </div>

      <p className="label mb-1">{L('لكل 100 جرام', 'Per 100 g')} {item.estimated && <span className="text-amber">{L('· تقديري، صححه لو تعرف', '· estimate, correct it if you know')}</span>}</p>
      <div className="mb-3 flex gap-2">{num('kcal', L('سعرات', 'kcal'))}{num('p', L('بروتين', 'Protein'))}{num('c', L('كارب', 'Carbs'))}{num('f', L('دهون', 'Fat'))}</div>

      <label className="mb-4 flex items-center justify-between rounded-xl bg-fill px-3 py-2.5">
        <span>{L('+15% أكل بيتي / زيت مستخبي', '+15% home-cooked / hidden oil')}</span>
        <input type="checkbox" className="size-5 accent-amber" checked={margin} onChange={(e) => setMargin(e.target.checked)} />
      </label>

      <div className="mb-5 rounded-2xl bg-fill p-3 text-center">
        <span className="num text-[30px]">{total.kcal}</span> <span className="text-ink-2">kcal</span>
        <p className="num text-[13px] text-ink-2">P {total.p} · C {total.c} · F {total.f}</p>
      </div>

      <div className="flex gap-2">
        <button className="press flex-1 rounded-2xl bg-accent text-white py-3 font-semibold" onClick={save}>{L('حفظ', 'Save')}</button>
        {item.id && <button className="press rounded-2xl bg-fill px-4 text-accent" onClick={again} aria-label={L('سجله تاني النهارده', 'Log again today')}><Repeat size={20} /></button>}
        {item.id && <button className="press rounded-2xl bg-red/15 px-4 text-red" onClick={remove} aria-label={L('مسح', 'Delete')}><Trash2 size={20} /></button>}
      </div>
    </Sheet>
  )
}
