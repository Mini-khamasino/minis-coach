// The coach: rules over the person's own data → messages through the day. No AI, works offline.
import { db, getSettings, today, type CoachMessage, type Item, type Settings, type Workout } from './db.ts'
import { addDays, sum, weightTrend, adaptiveTdee, daysBetween } from './calc.ts'
import { PROGRAMS, suggestProgram, exName, workoutKcal } from './exercises.ts'
import { nextDayIndex, weeklySets, personalRecords } from './training.ts'
import { L, lang } from './i18n.ts'

const SWEETS = new Set(['dates', 'ajwa', 'honey', 'black_honey', 'halawa', 'jam', 'sugar', 'basbousa', 'konafa', 'kunafa_cheese', 'qatayef', 'kahk', 'biscuits', 'molto', 'cake', 'chocolate', 'ice_cream', 'roz_bel_laban', 'mehalabeya', 'om_ali', 'feteer_sugar', 'donut', 'nutella', 'cinnabon', 'waffle', 'pancakes', 'luqaimat', 'kleija', 'mutabbaq_sweet', 'masoub', 'areeka', 'soda', 'juice_boxed'])
const PROTEIN_IDEAS = () => L('صدر فراخ، تونة، زبادي يوناني، بيض، جبنة قريش، أو سكوب بروتين', 'chicken breast, tuna, Greek yogurt, eggs, cottage cheese, or a protein scoop')

export interface Ctx {
  now: Date
  s: Settings
  items: Item[] // last 15 days
  waterToday: number
  weights: { date: string; kg: number }[]
  workouts: Workout[]
  muted: Record<string, number> // kind → muted until (ms)
}

type Draft = Omit<CoachMessage, 'id' | 'ts' | 'read' | 'date'>

const kcalOn = (items: Item[], d: string) => sum(items.filter((i) => i.date === d)).kcal
const name = (s: Settings) => s.name || L('يا بطل', 'champ')

/** All messages that *could* go out right now; the caller drops ones already sent (same key) or muted. */
export function generate(c: Ctx): Draft[] {
  const { s, now } = c
  const d = now.toLocaleDateString('en-CA')
  const h = now.getHours()
  const t = sum(c.items.filter((i) => i.date === d))
  const out: Draft[] = []
  const program = PROGRAMS.find((p) => p.id === s.programId) ?? suggestProgram(s.trainDays, s.place)
  const nextDay = program.days[nextDayIndex(c.workouts, program)]
  const trainedToday = c.workouts.some((w) => w.endedAt && w.date === d)
  const weighedToday = c.weights.some((w) => w.date === d)

  // morning plan + check-in
  if (h >= 5 && h < 12) {
    out.push({
      key: `morning:${d}`, kind: 'morning',
      text: L(
        `صباح الخير يا ${name(s)} ☀️\nهدف النهارده: ${s.goal} سعر و${s.protein}ج بروتين.${weighedToday ? '' : '\n⚖️ اوزن نفسك قبل الأكل.'}\n🏋️ التمرين الجاي: ${nextDay.ar}\nنمت كويس؟`,
        `Morning ${name(s)} ☀️\nToday: ${s.goal} kcal and ${s.protein} g protein.${weighedToday ? '' : '\n⚖️ Weigh in before eating.'}\n🏋️ Next workout: ${nextDay.en}\nDid you sleep well?`,
      ),
      replies: [
        { id: 'sleep_good', label: L('نمت كويس 😴', 'Slept well 😴') },
        { id: 'sleep_bad', label: L('نمت وحش 😵', 'Slept badly 😵') },
      ],
    })
    out.push({
      key: `plans:${d}`, kind: 'plans',
      text: L('عندك حاجة النهارده ممكن تلخبط الأكل؟', 'Anything today that could throw off your eating?'),
      replies: [
        { id: 'plan_feast', label: L('عزومة 🍖', 'Family feast 🍖') },
        { id: 'plan_restaurant', label: L('مطعم 🍔', 'Restaurant 🍔') },
        { id: 'plan_busy', label: L('يوم زحمة 🏃', 'Busy day 🏃') },
        { id: 'plan_normal', label: L('يوم عادي 👌', 'Normal day 👌') },
      ],
    })
  }

  // protein pace mid-afternoon
  if (h >= 15 && h < 20 && t.p < s.protein * 0.45) {
    out.push({ key: `protein:${d}`, kind: 'protein', text: L(
      `بروتينك ${Math.round(t.p)}ج من ${s.protein} والساعة ${h} 👀\nضيف حاجة من دول في الوجبة الجاية: ${PROTEIN_IDEAS()}.`,
      `Protein is at ${Math.round(t.p)} of ${s.protein} g and it's ${h}:00 👀\nAdd one of these next meal: ${PROTEIN_IDEAS()}.`) })
  }

  // water pace
  if (h >= 14 && h < 21 && c.waterToday < s.waterGoal * 0.4) {
    out.push({ key: `water:${d}`, kind: 'water', text: L(
      `💧 شربت ${(c.waterToday / 1000).toFixed(1)} لتر بس من ${s.waterGoal / 1000}. قوم اشرب كوبايتين دلوقتي — العطش ساعات بيتحس جوع.`,
      `💧 Only ${(c.waterToday / 1000).toFixed(1)} L of ${s.waterGoal / 1000}. Drink two glasses now — thirst often feels like hunger.`) })
  }

  // evening budget
  if (h >= 19 && h < 23 && t.kcal > 0) {
    const left = s.goal - t.kcal
    const text = left > 450
      ? L(`فاضلك ${left} سعر للعشا 👌 خليه بروتين عالي: ${PROTEIN_IDEAS()} مع خضار.`, `${left} kcal left for dinner 👌 Make it high-protein: ${PROTEIN_IDEAS()} with veggies.`)
      : left >= 0
        ? L(`فاضل ${left} بس — عشا خفيف (زبادي، بيض، سلطة) وتقفل اليوم في الأخضر 💚`, `Only ${left} left — a light dinner (yogurt, eggs, salad) keeps the day green 💚`)
        : t.kcal <= s.maintenance
          ? L(`عديت هدفك بـ ${-left} بس لسه تحت الصيانة — لسه في عجز، مفيش حاجة باظت. اقفل المطبخ بقى 😄`, `${-left} over target but still under maintenance — still a deficit, nothing ruined. Close the kitchen now 😄`)
          : L(`النهارده عدّى الصيانة بـ ${t.kcal - s.maintenance}. عادي، يوم واحد مش بيبوظ أسبوع — بكره نرجع للخطة ومن غير تعويض بالجوع.`, `Today went ${t.kcal - s.maintenance} over maintenance. One day doesn't ruin a week — back to plan tomorrow, no starving to compensate.`)
    out.push({ key: `evening:${d}`, kind: 'evening', text })
  }

  // late-night sweets pattern (3+ of the last 7 nights), at most once a week
  const lateSweetDays = new Set(c.items.filter((i) => i.foodId && SWEETS.has(i.foodId) && new Date(i.ts).getHours() >= 22 && daysBetween(i.date, d) <= 7).map((i) => i.date))
  if (lateSweetDays.size >= 3) {
    out.push({
      key: `sweets:${addDays(d, -now.getDay())}`, kind: 'sweets',
      text: L(`لاحظت حلويات بعد 10 بالليل ${lateSweetDays.size} أيام الأسبوع ده 🍫 إيه اللي بيحصل الوقت ده؟`, `I noticed sweets after 10pm on ${lateSweetDays.size} nights this week 🍫 What's going on around then?`),
      replies: [
        { id: 'sweets_hungry', label: L('جعان فعلاً', 'Actually hungry') },
        { id: 'sweets_bored', label: L('زهقان / سهران', 'Bored / up late') },
        { id: 'sweets_habit', label: L('عادة مع الشاي', 'Habit with tea') },
        { id: 'sweets_out', label: L('خروجات', 'Going out') },
      ],
    })
  }

  // training: behind on the week by Thursday
  const sessions = new Set(c.workouts.filter((w) => w.endedAt && daysBetween(w.date, d) < 7).map((w) => w.date)).size
  if (now.getDay() === 4 && h >= 12 && sessions < s.trainDays - 1 && !trainedToday) {
    out.push({ key: `training:${d}`, kind: 'training', text: L(
      `اتمرنت ${sessions} من ${s.trainDays} الأسبوع ده. لو الوقت ضيق، ${nextDay.ar} في 35 دقيقة أحسن من صفر: أول 3 تمارين بس، 3 سيتات.`,
      `${sessions} of ${s.trainDays} sessions this week. Short on time? ${nextDay.en} in 35 minutes beats zero: first 3 exercises, 3 sets each.`) })
  }

  // Thursday night (the weekend starts in KSA and Egypt)
  if (now.getDay() === 4 && h >= 16 && h < 22) {
    out.push({
      key: `thursday:${d}`, kind: 'thursday',
      text: L('الخميس 🎉 خارج الليلة؟', "It's Thursday 🎉 Going out tonight?"),
      replies: [{ id: 'thu_out', label: L('أيوه خارج', "Yes, I'm out") }, { id: 'thu_home', label: L('قاعد في البيت', 'Staying in') }],
    })
  }

  // green streaks
  let streak = 0
  for (let n = 1; n <= 30; n++) {
    const k = kcalOn(c.items, addDays(d, -n))
    if (!k || k > s.greenMax) break
    streak++
  }
  if ([3, 7, 14, 21, 30].includes(streak) && h >= 8) {
    out.push({ key: `streak:${streak}:${addDays(d, -streak)}`, kind: 'streak', text: L(`🔥 ${streak} أيام ورا بعض في الأخضر! ده بالظبط اللي بيغير الجسم. كمّل.`, `🔥 ${streak} green days in a row! This is exactly what changes a body. Keep going.`) })
  }

  // end-of-day summary (from 21:00)
  if (h >= 21 && t.kcal > 0) out.push({ key: `summary:${d}`, kind: 'summary', text: daySummary(c, d) })

  // weekly review on the weekday they started
  if (now.getDay() === new Date(s.startDate).getDay() && h >= 9 && daysBetween(s.startDate, d) >= 7) {
    out.push({ key: `weekly:${d}`, kind: 'weekly', text: weeklyReview(c, d) })
  }

  return out.filter((m) => !(c.muted[m.kind] > now.getTime()))
}

function daySummary(c: Ctx, d: string): string {
  const { s } = c
  const t = sum(c.items.filter((i) => i.date === d))
  const good: string[] = [], fix: string[] = []
  if (t.kcal <= s.greenMax) good.push(L(`السعرات في الأخضر (${t.kcal})`, `calories in the green (${t.kcal})`))
  else fix.push(L(`السعرات ${t.kcal} — ${t.kcal - s.goal} فوق الهدف`, `calories ${t.kcal} — ${t.kcal - s.goal} over`))
  if (t.p >= s.protein * 0.85) good.push(L(`بروتين ${Math.round(t.p)}ج 💪`, `protein ${Math.round(t.p)} g 💪`))
  else fix.push(L(`البروتين ${Math.round(t.p)} من ${s.protein}ج`, `protein ${Math.round(t.p)} of ${s.protein} g`))
  if (c.waterToday >= s.waterGoal * 0.9) good.push(L('المية تمام', 'water on point'))
  else fix.push(L(`المية ${(c.waterToday / 1000).toFixed(1)} لتر`, `water ${(c.waterToday / 1000).toFixed(1)} L`))
  if (c.workouts.some((w) => w.endedAt && w.date === d)) good.push(L('اتمرنت', 'trained'))
  const focus = !fix.length
    ? L('بكره: نفس الكلام 👏', 'Tomorrow: same again 👏')
    : t.p < s.protein * 0.85
      ? L('بكره: بروتين في الفطار (بيض/زبادي يوناني) يسهّل الباقي.', 'Tomorrow: protein at breakfast (eggs/Greek yogurt) makes the rest easier.')
      : c.waterToday < s.waterGoal * 0.9
        ? L('بكره: زجاجة مية جنبك من الصبح.', 'Tomorrow: keep a bottle next to you from the morning.')
        : L('بكره: سجل الأكل قبل ما تاكله، مش بعد.', 'Tomorrow: log food before you eat it, not after.')
  return L(
    `📋 ملخص النهارده\n✅ ${good.join('، ') || 'لسه'}\n${fix.length ? `🔧 ${fix.join('، ')}\n` : ''}🎯 ${focus}`,
    `📋 Today's summary\n✅ ${good.join(', ') || 'nothing yet'}\n${fix.length ? `🔧 ${fix.join(', ')}\n` : ''}🎯 ${focus}`,
  )
}

function weeklyReview(c: Ctx, d: string): string {
  const { s } = c
  const days = Array.from({ length: 7 }, (_, n) => kcalOn(c.items, addDays(d, -1 - n))).filter(Boolean)
  const avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0
  const trend = weightTrend(c.weights)
  const at = (date: string) => [...trend].filter(([k]) => k <= date).at(-1)?.[1]
  const nowKg = at(d), weekAgo = at(addDays(d, -7))
  const change = nowKg && weekAgo ? +(nowKg - weekAgo).toFixed(1) : null
  const sessions = new Set(c.workouts.filter((w) => w.endedAt && daysBetween(w.date, d) < 7).map((w) => w.date)).size
  const daily = new Map<string, number>()
  for (const i of c.items) daily.set(i.date, (daily.get(i.date) ?? 0) + i.kcal)
  const tdee = adaptiveTdee([...daily].map(([date, kcal]) => ({ date, kcal })), c.weights, d)
  let tip = L('كمّل زي ما انت.', 'Keep doing what you’re doing.')
  if (change !== null && nowKg && days.length >= 5) {
    const pct = (-change / nowKg) * 100
    if (s.goalType === 'cut' && change >= -0.1) tip = L('الوزن ثابت أسبوع — لو تاني أسبوع كده هننزل 150 سعر.', 'Weight flat for a week — if it stays flat next week, drop 150 kcal.')
    else if (s.goalType === 'cut' && pct > 1.2) tip = L('بتنزل أسرع من اللازم (عضل بيضيع) — زود 150 سعر.', 'Losing too fast (muscle at risk) — add 150 kcal.')
    else if (s.goalType === 'bulk' && change <= 0) tip = L('مفيش زيادة — زود 150 سعر.', 'No gain — add 150 kcal.')
  }
  const kg = change === null ? '—' : `${change > 0 ? '+' : ''}${change}`
  return L(
    `📊 مراجعة الأسبوع\nمتوسط السعرات: ${avg || '—'} (هدفك ${s.goal})\nالوزن: ${kg} كجم\nتمارين: ${sessions} من ${s.trainDays}${tdee ? `\nحرقك الفعلي: ${tdee} سعر` : ''}\n👉 ${tip}`,
    `📊 Weekly review\nAverage calories: ${avg || '—'} (target ${s.goal})\nWeight: ${kg} kg\nWorkouts: ${sessions} of ${s.trainDays}${tdee ? `\nYour real burn: ${tdee} kcal` : ''}\n👉 ${tip}`,
  )
}

/** The coach's answer to a quick reply. */
export function advice(replyId: string, s: Settings): string {
  const a: Record<string, [string, string]> = {
    sleep_good: ['حلو 👌 جسمك مستعد — لو عندك تمرين النهارده زوّد وزن بسيط عن آخر مرة.', 'Nice 👌 You’re recovered — if you train today, add a little weight over last time.'],
    sleep_bad: ['النوم القليل بيزود الجوع والرغبة في الحلو النهارده — ده هرمونات مش ضعف إرادة.\n• بروتين في الفطار\n• القهوة قبل 2 الضهر بس\n• لو تمرين: خفف الأوزان، متكسرش أرقام\n• نام بدري النهارده', 'Short sleep raises hunger and sugar cravings today — that’s hormones, not weak willpower.\n• Protein at breakfast\n• Coffee before 2pm only\n• If training: go lighter, no PR attempts\n• Sleep early tonight'],
    plan_feast: [`في العزومة:\n• ابدأ بالسلطة والبروتين\n• طبق واحد، متقومش تاني\n• الحلو حتة صغيرة\n• وفّر 300–400 سعر من الفطار والغدا\nحدك الأقصى النهارده ${s.maintenance} عشان تفضل في عجز.`, `At the feast:\n• Start with salad and protein\n• One plate, no seconds\n• A small piece of dessert\n• Save 300–400 kcal from breakfast and lunch\nYour ceiling today is ${s.maintenance} to stay in a deficit.`],
    plan_restaurant: ['في المطعم: مشوي بدل مقلي، الصوص على جنب، والمشروب زيرو. السعرات مكتوبة في المنيو — سجلها من "منيو / ملصق" في الأكل.', 'At the restaurant: grilled over fried, sauce on the side, zero drink. Calories are on the menu — log them with "Menu / label" in Food.'],
    plan_busy: ['يوم زحمة = حضّر سناك بروتين معاك (زبادي، تونة، بروتين بار) عشان متوصلش جعان جداً بالليل.', 'Busy day = carry a protein snack (yogurt, tuna, protein bar) so you don’t get home starving.'],
    plan_normal: ['تمام 👌 سجل الوجبات أول بأول والنهارده هيبقى سهل.', 'Great 👌 Log meals as you go and today will be easy.'],
    sweets_hungry: ['لو جعان فعلاً بالليل يبقى العشا قليل. خليه أكبر وفيه بروتين، وسيب 150–200 سعر لسناك بالليل (زبادي يوناني بعسل، أو تمرتين مع لبن).', 'If you’re truly hungry at night, dinner is too small. Make it bigger with protein and keep 150–200 kcal for a night snack (Greek yogurt with honey, or two dates with milk).'],
    sweets_bored: ['السهر والزهق أكبر سبب للأكل بالليل. جرب: اقفل المطبخ بعد العشا، شاي من غير سكر، والموبايل بعيد عن السرير. ولو هتاكل حلو، سجله قبل ما تاكله.', 'Late nights and boredom drive most night eating. Try: close the kitchen after dinner, unsweetened tea, phone away from bed. If you eat sweets, log them before eating.'],
    sweets_habit: ['العادة بتتكسر بالبديل مش بالمنع: الشاي بالليل مع حاجة 50–100 سعر (تمرة واحدة، حتة شوكولاتة دارك) بدل الطبق.', 'Habits break with a swap, not a ban: night tea with something 50–100 kcal (one date, a square of dark chocolate) instead of a plate.'],
    sweets_out: ['في الخروجات: اختار حاجة واحدة بس (يا حلو يا مشروب سكري)، وشاركها لو تقدر.', 'When out: pick just one (dessert or a sugary drink), and share it if you can.'],
    thu_out: ['استمتع 🎉 كُل عادي بس: مشروب زيرو، طبق واحد، ومتسيبش ليلة تبقى ويك إند كامل. بكرة ترجع للخطة.', 'Enjoy 🎉 Just: zero drink, one plate, and don’t let one night become the whole weekend. Back to plan tomorrow.'],
    thu_home: ['فرصة حلوة: نوم بدري = جوع أقل بكره 😴', 'Good chance for an early night = less hunger tomorrow 😴'],
  }
  const x = a[replyId]
  return x ? L(x[0], x[1]) : ''
}

/** Read the database, add any due messages. Safe to call often: keys keep it to one per rule per day. */
export async function runCoach(now = new Date()) {
  const s = await getSettings()
  if (!s.onboarded && !(await db.items.count())) return
  const from = addDays(today(), -15)
  const [items, water, weights, workouts, prefs] = await Promise.all([
    db.items.where('date').aboveOrEqual(from).toArray(),
    db.water.where('date').equals(today()).toArray(),
    db.weights.orderBy('date').toArray(),
    db.workouts.where('date').aboveOrEqual(from).toArray(),
    db.kv.get('coachPrefs'),
  ])
  const muted = (prefs?.value as { muted?: Record<string, number> } | undefined)?.muted ?? {}
  const drafts = generate({ now, s, items, waterToday: water.reduce((a, w) => a + w.ml, 0), weights, workouts, muted })
  if (!drafts.length) return
  const existing = new Set((await db.messages.where('key').anyOf(drafts.map((m) => m.key)).toArray()).map((m) => m.key))
  const fresh = drafts.filter((m) => !existing.has(m.key))
  if (fresh.length) await db.messages.bulkAdd(fresh.map((m, i) => ({ ...m, date: today(), ts: now.getTime() + i, read: false })))
}

export async function pickReply(m: CoachMessage, replyId: string) {
  const s = await getSettings()
  await db.messages.update(m.id!, { picked: replyId })
  const text = advice(replyId, s)
  const key = `${m.key}:${replyId}`
  if (text && !(await db.messages.where('key').equals(key).count())) await db.messages.add({ key, kind: 'reply', date: today(), ts: Date.now(), text, read: true })
}

/** 👎 mutes that kind of message for a week. */
export async function react(m: CoachMessage, emoji: string) {
  const next = m.reaction === emoji ? undefined : emoji
  await db.messages.update(m.id!, { reaction: next })
  if (next === '👎' && m.kind !== 'reply') {
    const prefs = ((await db.kv.get('coachPrefs'))?.value as { muted?: Record<string, number> } | undefined) ?? {}
    await db.kv.put({ key: 'coachPrefs', value: { ...prefs, muted: { ...prefs.muted, [m.kind]: Date.now() + 7 * 86400_000 } } })
  }
}

// ── "Ask an AI": a prompt the person pastes into ChatGPT / Gemini / Claude ──

export async function aiPrompt(mode: 'full' | 'update', question: string): Promise<string> {
  const s = await getSettings()
  const last = (await db.kv.get('lastAiShare'))?.value as number | undefined
  const since = mode === 'update' && last ? new Date(last).toLocaleDateString('en-CA') : addDays(today(), -7)
  const [items, weights, workouts, waters] = await Promise.all([
    db.items.where('date').aboveOrEqual(since).toArray(),
    db.weights.orderBy('date').toArray(),
    db.workouts.where('date').aboveOrEqual(since).toArray(),
    db.water.where('date').aboveOrEqual(since).toArray(),
  ])
  const dates = [...new Set(items.map((i) => i.date))].sort()
  const dayLines = dates.map((d) => {
    const t = sum(items.filter((i) => i.date === d))
    const ml = waters.filter((w) => w.date === d).reduce((a, w) => a + w.ml, 0)
    const foods = items.filter((i) => i.date === d).map((i) => `${i.name} ${i.perServing ? `${i.grams / 100}x` : `${i.grams}g`}`).join(', ')
    return `- ${d}: ${t.kcal} kcal, P${Math.round(t.p)} C${Math.round(t.c)} F${Math.round(t.f)}, water ${ml} ml — ${foods}`
  })
  const trend = weightTrend(weights)
  const wLines = weights.filter((w) => w.date >= since).map((w) => `- ${w.date}: ${w.kg} kg (trend ${trend.get(w.date)})`)
  const bodyKg = weights.at(-1)?.kg ?? 75
  const woLines = workouts.filter((w) => w.endedAt).map((w) => {
    const min = Math.round((w.endedAt! - w.startedAt) / 60000)
    const done = w.exercises.map((e) => [exName(e.exId), e.sets.filter((x) => x.done).map((x) => `${x.kg}x${x.reps}`).join(' ')]).filter(([, v]) => v).map(([n, v]) => `${n} ${v}`)
    return `- ${w.date} (${min} min, ~${workoutKcal(min, bodyKg)} kcal): ${done.join('; ')}`
  })
  const program = PROGRAMS.find((p) => p.id === s.programId) ?? suggestProgram(s.trainDays, s.place)
  const answerLang = lang === 'en' ? 'English' : 'Egyptian Arabic'
  const prs = personalRecords(await db.workouts.toArray())

  const header = mode === 'full'
    ? `You are my personal nutrition and gym coach. My app (Mini's Coach) tracks everything; my data is below. Please save the key facts about me to your memory if you have one, and keep this chat for future updates — I'll send short updates here instead of repeating everything. Answer in ${answerLang}, practical and specific to my numbers.

## Me
${s.name || '—'}, ${s.sex === 'm' ? 'male' : 'female'}, ${s.age} y, ${s.heightCm} cm. Goal: ${s.goalType} (started ${s.startKg} kg on ${s.startDate}, target ${s.targetKg} kg).
Targets: ${s.goal} kcal/day, protein ${s.protein} g, water ${s.waterGoal} ml. Estimated maintenance ${s.maintenance} kcal.
Training: ${program.en}, ${s.trainDays} days/week at ${s.place === 'gym' ? 'the gym' : 'home'}. Rotation: ${program.days.map((d) => d.en).join(' → ')}.
Weekly sets per muscle: ${[...weeklySets(workouts, Date.now())].map(([m, n]) => `${m} ${n}`).join(', ') || 'none yet'}.
Best lifts: ${[...prs].map(([id, p]) => `${exName(id)} ${p.kg}x${p.reps}`).join(', ') || 'none yet'}.`
    : `Update from my tracking app since ${since} (same person as before in this chat). Answer in ${answerLang}.`

  return `${header}

## Food log
${dayLines.join('\n') || '- nothing logged'}

## Weight
${wLines.join('\n') || '- no weigh-ins'}

## Workouts
${woLines.join('\n') || '- none'}

${question.trim() ? `## My question\n${question.trim()}` : '## What I want\nReview this and give me the 1–3 most useful changes for the coming days.'}
`
}

export const markAiShared = () => db.kv.put({ key: 'lastAiShare', value: Date.now() })
