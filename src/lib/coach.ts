import { db, getSettings, saveSettings, makeItem, today, MEALS, type Meal, type Settings } from './db.ts'
import { FOODS, FOOD_LIST_FOR_PROMPT, type Macros } from './foods.ts'
import { sum, addDays, trajectory, mifflin, adaptiveTdee, daysBetween, weightTrend } from './calc.ts'

const MAX_NOTES = 30
const DAYS_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت']

const PERSONA = `إنت "كوتش ميني" — صاحب ميني (21 سنة، ولد) وكوتش التغذية بتاعه. بتتكلم مصري عامية، دمك خفيف، حازم بس مرن ومش بتعقّد.
- لو أكل حلويات/تمر/فطير بالليل: هزّقه بهزار ووضحله التمن.
- لو أكل أكل مالح وشرب مية قليلة: نبّهه إن الوزن هيعلّق مية.
- لو عدّى الهدف بس لسه تحت سقف الصيانة: طمّنه إنه لسه في عجز ومفيش حاجة باظت.
- النزول السريع في أول أسبوعين أغلبه مية وجلايكوجين، متخليهوش يتوقع نفس السرعة بعدين.
- ركّز على البروتين والمية وال streak. ردودك قصيرة (2-5 سطور) إلا لو سأل سؤال محتاج شرح.
- ميني بياكل أكل متنوع: مصري، خليجي (كبسة/مندي)، فاست فود (بيتزا/برجر)، غربي. متفترضش إنه مصري بس.
- الوزن: بيوزن نفسه كل يوم الصبح بعد الحمام وقبل الأكل. ركز على الـ trend (المتوسط) مش وزن يوم لوحده، ومتقلقش من تذبذب ±1 كجم.
- إنت مش بتحسب سعرات: التطبيق بيحسبها من جدوله. شغلتك تفهم الأكل والجرامات.`

const RULES = `قواعد الـ JSON:
- logged_items: بس لو ميني بيقول إنه أكل/شرب حاجة فعلاً. لو بيسأل أو بيفكر ("ينفع آكل..؟") سيبها فاضية [].
- لكل صنف: food_id من الجدول تحت لو فيه حاجة مطابقة أو قريبة جداً، غير كده null وحط تقديرك لكل 100 جرام في est_*.
- grams: حوّل أي وحدة لجرامات (رغيف بلدي ~90ج، بيضة ~50ج، تمرة ~10ج، معلقة زيت ~13ج، معلقة عسل ~20ج، كوباية ~200مل=200ج). لو مقالش الكمية خمّن حصة مصرية عادية.
- السندويتشات والأطباق المركبة: يا إما صنف مطابق في الجدول، يا إما فككها لمكوناتها.
- homemade: true لو أكل بيتي متسبك/فيه سمنة أو زيت (التطبيق بيزود 15%).
- meal: فطار | غدا | عشا | سناك حسب الكلام والساعة.
- water_added_ml: مية سادة بس (مش شاي/قهوة). new_weight_kg: لو قال وزنه النهارده.
- toast_summary: سطر قصير جداً بالي اتسجل (مثلاً "✅ 2 بيض + رغيف"). فاضي لو مفيش تسجيل.
- memory_updates: add = حقائق جديدة تستاهل تتفتكر (تفضيلات، مواعيد، عادات، ظروف). remove_ids = أرقام الملاحظات اللي بقت غلط أو قديمة. متكررش ملاحظة موجودة.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    toast_summary: { type: 'STRING' },
    logged_items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          food_id: { type: 'STRING', nullable: true },
          grams: { type: 'NUMBER' },
          homemade: { type: 'BOOLEAN' },
          meal: { type: 'STRING', enum: MEALS },
          est_kcal_100: { type: 'NUMBER' },
          est_p_100: { type: 'NUMBER' },
          est_c_100: { type: 'NUMBER' },
          est_f_100: { type: 'NUMBER' },
        },
        required: ['name', 'grams', 'homemade', 'meal'],
      },
    },
    water_added_ml: { type: 'NUMBER' },
    new_weight_kg: { type: 'NUMBER', nullable: true },
    memory_updates: {
      type: 'OBJECT',
      properties: {
        add: { type: 'ARRAY', items: { type: 'STRING' } },
        remove_ids: { type: 'ARRAY', items: { type: 'NUMBER' } },
      },
    },
  },
  required: ['reply', 'toast_summary', 'logged_items', 'water_added_ml'],
}

interface GeminiItem {
  name: string
  food_id?: string | null
  grams: number
  homemade: boolean
  meal: string
  est_kcal_100?: number
  est_p_100?: number
  est_c_100?: number
  est_f_100?: number
}
interface GeminiReply {
  reply: string
  toast_summary: string
  logged_items: GeminiItem[]
  water_added_ml: number
  new_weight_kg?: number | null
  memory_updates?: { add?: string[]; remove_ids?: number[] }
}

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

async function customList(): Promise<string> {
  const c = await db.customFoods.toArray()
  return c.map((f) => `u:${f.name}=${f.name} (أكل ميني الخاص)`).join('\n')
}

export async function callGemini(userText: string): Promise<GeminiReply> {
  const s = await getSettings()
  if (!s.apiKey) throw new Error('حط مفتاح Gemini في الإعدادات الأول')
  const d = today()
  const history = (await db.chat.where('date').equals(d).toArray()).slice(-6)

  const system = `${PERSONA}\n\n${RULES}\n\n=== حالة ميني (محسوبة من التطبيق) ===\n${await statusCard(s, d)}\n\n=== جدول الأكل (id=اسم) ===\n${FOOD_LIST_FOR_PROMPT}\n${await customList()}`
  const contents = [
    ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userText }] },
  ]

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.6 },
  }
  let res = await generate(s.model, s.apiKey, body)
  if (res.status === 404) {
    // Google retired the model: switch to the newest Flash this key can use, remember it, retry once.
    const next = await pickModel(s.apiKey)
    if (next !== s.model) {
      await saveSettings({ model: next })
      res = await generate(next, s.apiKey, body)
    }
  }
  if (!res.ok) throw await apiError(res)
  const data = await res.json()
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')
  if (!text) throw new Error('Gemini مرجعش رد')
  const parsed = JSON.parse(text) as GeminiReply
  if (typeof parsed.reply !== 'string') throw new Error('رد Gemini مش مفهوم')
  return parsed
}

/** Thinking makes Flash slow; parsing food doesn't need it. Gemini 3+ takes a level, 2.x a token budget. */
export function thinkingFor(model: string): object | undefined {
  const v = Number(model.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1])
  if (v >= 3 || model.includes('latest')) return { thinkingLevel: model.includes('lite') ? 'minimal' : 'low' }
  if (v >= 2.5) return { thinkingBudget: 0 }
  return undefined
}

async function generate(model: string, key: string, body: { generationConfig: object }) {
  const send = (thinking?: object) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, ...(thinking && { thinkingConfig: thinking }) } }),
    })
  let thinking = thinkingFor(model)
  let res = await send(thinking)
  // 503/500 = Google overloaded: wait and retry twice before showing an error.
  for (const wait of [1500, 3000]) {
    if (res.status === 400 && thinking && /thinking/i.test(await res.clone().text())) thinking = undefined // model rejects the setting
    else if (res.status !== 503 && res.status !== 500) break
    else await new Promise((r) => setTimeout(r, wait))
    res = await send(thinking)
  }
  return res
}

async function apiError(res: Response): Promise<Error> {
  const body = await res.text()
  if (res.status === 400 && /API.?key/i.test(body)) return new Error('مفتاح Gemini غلط — انسخه تاني من aistudio')
  if (res.status === 403) return new Error('المفتاح مش مسموح له — اتأكد إن Gemini API متفعل للمشروع')
  if (res.status === 404) return new Error('الموديل مش موجود — اختار غيره من الإعدادات')
  if (res.status === 429) return new Error('Gemini زهق (حد الاستخدام) — جرب كمان شوية')
  if (res.status === 503 || res.status === 500) return new Error('سيرفرات Gemini زحمة دلوقتي — جرب تاني كمان دقيقة')
  return new Error(`Gemini ${res.status}`)
}

/** Fastest usable model: newest stable Flash-Lite, then Flash, then the auto-updating aliases. */
export async function pickModel(key: string): Promise<string> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } })
  if (!res.ok) throw await apiError(res)
  const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  const newest = (re: RegExp) =>
    names
      .map((n) => ({ n, v: n.match(re)?.[1] }))
      .filter((x) => x.v)
      .sort((a, b) => Number(b.v) - Number(a.v))[0]?.n
  const pick =
    newest(/^gemini-(\d+(?:\.\d+)?)-flash-lite$/) ??
    newest(/^gemini-(\d+(?:\.\d+)?)-flash$/) ??
    names.find((n) => n === 'gemini-flash-lite-latest') ??
    names.find((n) => n === 'gemini-flash-latest') ??
    names.find((n) => n.includes('flash'))
  if (!pick) throw new Error('مفيش موديل Flash متاح للمفتاح ده')
  return pick
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)

/** Send a message, apply what the coach logged, store the chat. `date` = day the food goes to. */
export async function sendToCoach(userText: string, date = today()): Promise<{ reply: string; toast: string }> {
  const r = await callGemini(userText)
  const ts = Date.now()
  const customs = new Map((await db.customFoods.toArray()).map((f) => [`u:${f.name}`, f]))

  const items = (Array.isArray(r.logged_items) ? r.logged_items : []).flatMap((g) => {
    const grams = num(g.grams, 1, 5000)
    if (!grams || !g.name) return []
    const meal: Meal = MEALS.includes(g.meal as Meal) ? (g.meal as Meal) : 'سناك'
    const custom = g.food_id ? customs.get(g.food_id) : undefined
    if (custom) return [makeItem(date, meal, custom.name, null, grams, custom.per100, false, false)]
    const food = g.food_id ? FOODS[g.food_id] : undefined
    if (food) return [makeItem(date, meal, g.name, food.id, grams, food, food.oily || !!g.homemade, false)]
    const per100 = {
      kcal: num(g.est_kcal_100, 0, 950) ?? 200,
      p: num(g.est_p_100, 0, 100) ?? 0,
      c: num(g.est_c_100, 0, 100) ?? 0,
      f: num(g.est_f_100, 0, 100) ?? 0,
    }
    return [makeItem(date, meal, g.name, null, grams, per100, !!g.homemade, true)]
  })

  const water = num(r.water_added_ml, 1, 5000)
  const kg = num(r.new_weight_kg, 30, 300)
  const add = (r.memory_updates?.add ?? []).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 200))
  const remove = (r.memory_updates?.remove_ids ?? []).filter((n) => typeof n === 'number')

  await db.transaction('rw', [db.items, db.water, db.weights, db.chat, db.notes], async () => {
    if (items.length) await db.items.bulkAdd(items)
    if (water) await db.water.add({ date, ml: water, ts })
    if (kg) await db.weights.put({ date, kg })
    if (remove.length) await db.notes.bulkDelete(remove)
    if (add.length) await db.notes.bulkAdd(add.map((text) => ({ text, ts })))
    const all = await db.notes.orderBy('id').primaryKeys()
    if (all.length > MAX_NOTES) await db.notes.bulkDelete(all.slice(0, all.length - MAX_NOTES))
    const logged = r.toast_summary?.trim() || undefined
    await db.chat.bulkAdd([
      { date: today(), ts, role: 'user', text: userText },
      { date: today(), ts: ts + 1, role: 'coach', text: r.reply, logged: items.length || water || kg ? logged : undefined },
    ])
  })
  return { reply: r.reply, toast: r.toast_summary?.trim() ?? '' }
}
