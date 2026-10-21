import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, X } from 'lucide-react'
import { db, makeItem, type CustomFood, type Meal, type RecipeIngredient, type SavedMeal } from '../lib/db.ts'
import { compute, sum } from '../lib/calc.ts'
import { FOODS } from '../lib/foods.ts'
import { search, customCandidates, type Candidate } from '../lib/parser.ts'
import { L } from '../lib/i18n.ts'
import { Sheet, Seg, toast } from './ui.tsx'

/** Search sheet used to correct a parsed line or add a recipe ingredient. */
export function FoodPicker({ raw, onPick, onClose }: { raw?: boolean; onPick: (c: Candidate) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const customs = customCandidates(useLiveQuery(() => db.customFoods.toArray()) ?? [])
  const results = search(q, customs, raw, 12)
  return (
    <Sheet title={raw ? L('مكوّن', 'Ingredient') : L('اختار الأكلة', 'Pick a food')} onClose={onClose}>
      <input className="field mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('دوّر…', 'Search…')} autoFocus />
      <ul className="mb-2">
        {results.map((c) => (
          <li key={c.key}>
            <button className="press flex w-full items-center justify-between border-b border-hair py-3 text-start" onClick={() => { onPick(c); onClose() }}>
              <span className="truncate">{c.name}{!c.foodId && <span className="ms-2 text-[12px] text-purple">{L('أكلك', 'yours')}</span>}</span>
              <span className="num shrink-0 text-[13px] text-ink-3">{c.per100.kcal}/100{L('ج', 'g')}</span>
            </button>
          </li>
        ))}
      </ul>
      {q.length >= 2 && !results.length && <p className="py-4 text-center text-ink-3">{L('مش لاقيها — استخدم "من المنيو/الملصق" أو اعمل وصفة', 'Not found — use "From label/menu" or build a recipe')}</p>}
    </Sheet>
  )
}

const numIn = (v: string) => Number(v.replace(',', '.')) || 0

/** Saudi menus and labels print calories by law — the most accurate source there is. */
export function LabelSheet({ date, meal, onClose }: { date: string; meal: Meal; onClose: () => void }) {
  const [mode, setMode] = useState<'menu' | 'label'>('menu')
  const [name, setName] = useState('')
  const [v, setV] = useState({ kcal: '', p: '', c: '', f: '', grams: '', servings: '1' })
  const save = async () => {
    const m = { kcal: numIn(v.kcal), p: numIn(v.p), c: numIn(v.c), f: numIn(v.f) }
    if (!name.trim() || !(m.kcal > 0 && m.kcal < 5000)) return toast(L('اكتب الاسم والسعرات', 'Enter a name and calories'))
    if (mode === 'menu') {
      const servings = numIn(v.servings) || 1
      await db.items.add({ ...makeItem(date, meal, name.trim(), null, servings * 100, m, false, false), acc: 'l', perServing: true })
    } else {
      const g = numIn(v.grams)
      if (!(g > 0 && g <= 5000)) return toast(L('اكتب كلت كام جرام', 'Enter how many grams you ate'))
      if (m.kcal > 950) return toast(L('ده لكل 100 جرام؟ الرقم كبير', 'Is that per 100 g? Too high'))
      await db.items.add({ ...makeItem(date, meal, name.trim(), null, g, m, false, false), acc: 'l' })
      await db.customFoods.put({ name: name.trim(), per100: m }) // packaged food: remember it for next time
    }
    toast(`🏷️ ${name.trim()}`)
    onClose()
  }
  const f = (k: keyof typeof v, label: string) => (
    <label className="flex-1"><span className="label">{label}</span>
      <input className="field num mt-1 text-center" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  )
  return (
    <Sheet title={L('من المنيو / الملصق', 'From menu / label')} onClose={onClose}>
      <div className="mb-3"><Seg value={mode} onChange={setMode} options={[['menu', L('منيو مطعم', 'Restaurant menu')], ['label', L('ملصق (لكل 100ج)', 'Label (per 100 g)')]]} /></div>
      <p className="mb-3 text-[13px] text-ink-2">{mode === 'menu'
        ? L('المطاعم في السعودية لازم تكتب السعرات في المنيو — انقل الرقم زي ما هو.', 'Saudi restaurants must print calories on the menu — copy the number as is.')
        : L('من جدول القيم الغذائية على العلبة، عمود الـ 100 جرام.', 'From the nutrition table on the pack, the per-100 g column.')}</p>
      <input className="field mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'menu' ? L('مثلاً: وجبة البيك مسحب', 'e.g. Albaik spicy meal') : L('اسم المنتج', 'Product name')} />
      <div className="mb-3 flex gap-2">{f('kcal', L('سعرات', 'kcal'))}{f('p', L('بروتين', 'Protein'))}{f('c', L('كارب', 'Carbs'))}{f('f', L('دهون', 'Fat'))}</div>
      <div className="mb-5">{mode === 'menu' ? f('servings', L('عدد الوجبات', 'Servings')) : f('grams', L('كلت كام جرام؟', 'Grams eaten'))}</div>
      <button className="press w-full rounded-2xl bg-accent py-3 font-semibold text-white" onClick={save}>{L('سجّل', 'Log')}</button>
    </Sheet>
  )
}

/** Recipe builder: raw ingredients + the cooked pot's weight → true kcal per 100 g of *your* dish. */
export function RecipeSheet({ existing, onClose }: { existing?: CustomFood; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [ings, setIngs] = useState<(RecipeIngredient & { per100: Candidate['per100'] })[]>(() =>
    existing?.recipe?.ingredients.map((i) => ({ ...i, per100: { kcal: 0, p: 0, c: 0, f: 0 } })) ?? [])
  const [cooked, setCooked] = useState(existing?.recipe ? String(existing.recipe.cookedGrams) : '')
  const [picking, setPicking] = useState(false)

  // ingredients restored from an existing recipe carry no per100 yet; look them up again
  const lookups = useLiveQuery(async () => Object.fromEntries((await db.customFoods.toArray()).map((c) => [c.name, c.per100])), []) ?? {}
  const per = (i: (typeof ings)[number]) => (i.per100.kcal ? i.per100 : (FOOD_PER100(i.foodId) ?? lookups[i.name] ?? i.per100))

  const total = sum(ings.map((i) => compute(per(i), i.grams || 0, false)))
  const rawWeight = ings.reduce((a, i) => a + (i.grams || 0), 0)
  const cookedG = numIn(cooked) || rawWeight
  const per100 = cookedG ? { kcal: Math.round((total.kcal / cookedG) * 100), p: +((total.p / cookedG) * 100).toFixed(1), c: +((total.c / cookedG) * 100).toFixed(1), f: +((total.f / cookedG) * 100).toFixed(1) } : null

  const save = async () => {
    if (!name.trim() || !ings.length || !per100) return toast(L('اسم ومكونات الأول', 'Add a name and ingredients'))
    if (existing && existing.name !== name.trim()) await db.customFoods.delete(existing.name)
    await db.customFoods.put({ name: name.trim(), per100, recipe: { ingredients: ings.map(({ foodId, name, grams }) => ({ foodId, name, grams })), cookedGrams: cookedG } })
    toast(L(`🍲 ${name.trim()}: ${per100.kcal} سعر/100ج — دوّر عليها وسجّل`, `🍲 ${name.trim()}: ${per100.kcal} kcal/100 g — search it to log`))
    onClose()
  }

  return (
    <Sheet title={existing ? L('تعديل وصفة', 'Edit recipe') : L('وصفة جديدة', 'New recipe')} onClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-2">{L('اوزن المكونات وهي نيئة، وبعد الطبخ اوزن الحلة كلها (من غير الحلة نفسها). كده كل طبق هتعرف سعراته بالظبط.', 'Weigh ingredients raw, then weigh all the cooked food (without the pot). Every plate after that is exact.')}</p>
      <input className="field mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('اسم الأكلة (مثلاً: كبسة البيت)', 'Dish name (e.g. Home kabsa)')} />
      {ings.map((i, k) => (
        <div key={k} className="mb-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px]">{i.name}</span>
          <input className="field num w-24 text-center" inputMode="decimal" value={i.grams || ''} placeholder={L('جرام', 'g')}
            onChange={(e) => setIngs(ings.map((x, j) => (j === k ? { ...x, grams: numIn(e.target.value) } : x)))} aria-label={L('جرام', 'grams')} />
          <button className="press p-1 text-ink-3" onClick={() => setIngs(ings.filter((_, j) => j !== k))} aria-label={L('شيل', 'Remove')}><X size={18} /></button>
        </div>
      ))}
      <button className="press mb-4 flex w-full items-center justify-center gap-1 rounded-xl bg-fill py-2.5 text-accent" onClick={() => setPicking(true)}><Plus size={18} /> {L('مكوّن', 'Ingredient')}</button>
      <label className="mb-4 block">
        <span className="label">{L('وزن الأكل كله بعد الطبخ (جرام)', 'Total cooked weight (g)')}</span>
        <input className="field num mt-1" inputMode="decimal" value={cooked} onChange={(e) => setCooked(e.target.value)} placeholder={rawWeight ? String(rawWeight) : ''} />
        {!numIn(cooked) && rawWeight > 0 && <span className="text-[12px] text-amber">{L('من غير وزن بعد الطبخ الرقم أقل دقة (الرز والمكرونة بيشربوا مية)', 'Without the cooked weight it’s less accurate (rice and pasta absorb water)')}</span>}
      </label>
      {per100 && (
        <div className="mb-5 rounded-2xl bg-fill p-3 text-center">
          <span className="num text-[30px]">{per100.kcal}</span> <span className="text-ink-2">{L('سعر / 100ج', 'kcal / 100 g')}</span>
          <p className="num text-[13px] text-ink-2">P {per100.p} · C {per100.c} · F {per100.f} · {L('الحلة كلها', 'whole pot')} {total.kcal}</p>
        </div>
      )}
      <button className="press w-full rounded-2xl bg-accent py-3 font-semibold text-white" onClick={save}>{L('احفظ الوصفة', 'Save recipe')}</button>
      {picking && <FoodPicker raw onClose={() => setPicking(false)} onPick={(c) => setIngs([...ings, { foodId: c.foodId ?? c.key, name: c.name, grams: 0, per100: c.per100 }])} />}
    </Sheet>
  )
}

const FOOD_PER100 = (id: string) => { const f = FOODS[id]; return f && { kcal: f.kcal, p: f.p, c: f.c, f: f.f } }

/** Saved meals (one-tap combos) and the person's own foods/recipes. */
export function MyFoods({ date, meal, onClose }: { date: string; meal: Meal; onClose: () => void }) {
  const meals = useLiveQuery(() => db.meals.toArray()) ?? []
  const customs = useLiveQuery(() => db.customFoods.toArray()) ?? []
  const [recipe, setRecipe] = useState<CustomFood | null | undefined>(undefined)
  const logMeal = async (m: SavedMeal) => {
    await db.items.bulkAdd(m.items.map((i) => ({ ...makeItem(date, meal, i.name, i.foodId, i.grams, i.per100, i.margin, false), perServing: i.perServing })))
    toast(`⭐ ${m.name} · ${sum(m.items.map((i) => compute(i.per100, i.grams, i.margin))).kcal} kcal`)
    onClose()
  }
  return (
    <Sheet title={L('أكلي', 'My foods')} onClose={onClose}>
      <h3 className="label mb-2">{L('وجبات محفوظة', 'Saved meals')}</h3>
      {!meals.length && <p className="mb-4 text-[14px] text-ink-3">{L('سجّل أكلة واحفظها كوجبة من زرار ⭐ وهي بتتسجل.', 'Save a combo with ⭐ while logging it.')}</p>}
      {meals.map((m) => (
        <div key={m.id} className="mb-2 flex items-center gap-2 rounded-2xl bg-fill p-3">
          <button className="press min-w-0 flex-1 text-start" onClick={() => logMeal(m)}>
            <p className="truncate font-medium">⭐ {m.name}</p>
            <p className="truncate text-[12px] text-ink-2">{m.items.map((i) => i.name).join(' · ')}</p>
          </button>
          <span className="num text-[15px]">{sum(m.items.map((i) => compute(i.per100, i.grams, i.margin))).kcal}</span>
          <button className="press p-1 text-ink-3" onClick={() => db.meals.delete(m.id!)} aria-label={L('مسح', 'Delete')}><Trash2 size={17} /></button>
        </div>
      ))}
      <div className="mt-5 mb-2 flex items-center justify-between">
        <h3 className="label">{L('وصفاتي وأكلي', 'Recipes & my foods')}</h3>
        <button className="press text-[14px] text-accent" onClick={() => setRecipe(null)}>+ {L('وصفة', 'Recipe')}</button>
      </div>
      {customs.map((c) => (
        <div key={c.name} className="flex items-center gap-2 border-b border-hair py-2.5">
          <button className="press min-w-0 flex-1 truncate text-start" onClick={() => c.recipe && setRecipe(c)} disabled={!c.recipe}>
            {c.recipe ? '🍲 ' : ''}{c.name}
          </button>
          <span className="num text-[13px] text-ink-3">{c.per100.kcal}/100{L('ج', 'g')}</span>
          <button className="press p-1 text-ink-3" onClick={() => db.customFoods.delete(c.name)} aria-label={L('مسح', 'Delete')}><Trash2 size={17} /></button>
        </div>
      ))}
      {recipe !== undefined && <RecipeSheet existing={recipe ?? undefined} onClose={() => setRecipe(undefined)} />}
    </Sheet>
  )
}
