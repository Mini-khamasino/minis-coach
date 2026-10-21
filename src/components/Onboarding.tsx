import { useEffect, useRef, useState, type ReactNode } from 'react'
import { db, saveSettings, today, type GoalType, type Sex } from '../lib/db.ts'
import { targetsFor } from '../lib/calc.ts'
import { restore } from '../lib/backup.ts'
import { signIn, type SyncState } from '../lib/syncCore.ts'
import { L, lang } from '../lib/i18n.ts'
import { Seg, GoogleButton, toast } from './ui.tsx'

const ACTIVITY = [
  { v: 1.2, ar: 'قاعد معظم اليوم', en: 'Mostly sitting', subAr: 'مكتب، مذاكرة، مفيش رياضة', subEn: 'Desk/study, no training' },
  { v: 1.375, ar: 'حركة خفيفة', en: 'Lightly active', subAr: 'تمرين 1–3 مرات في الأسبوع', subEn: 'Training 1–3×/week' },
  { v: 1.55, ar: 'نشيط', en: 'Active', subAr: 'جيم 3–5 مرات في الأسبوع', subEn: 'Gym 3–5×/week' },
  { v: 1.725, ar: 'نشيط جداً', en: 'Very active', subAr: 'جيم 6–7 مرات أو شغل بمجهود', subEn: 'Gym 6–7×/week or physical job' },
]

const GOALS: { v: GoalType; ar: string; en: string; emoji: string }[] = [
  { v: 'cut', ar: 'أخس / أنشف', en: 'Lose fat', emoji: '🔥' },
  { v: 'maintain', ar: 'أحافظ على وزني', en: 'Maintain', emoji: '⚖️' },
  { v: 'bulk', ar: 'أزود عضل', en: 'Build muscle', emoji: '💪' },
]

export function Onboarding({ sync }: { sync: SyncState }) {
  const [step, setStep] = useState(0)
  const [p, setP] = useState({ name: '', sex: 'm' as Sex, age: '', heightCm: '', kg: '', activity: 1.375, goalType: 'cut' as GoalType, targetKg: '', trainDays: 3 })
  const file = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<typeof p>) => setP({ ...p, ...patch })

  // signed in but the cloud had nothing to restore → carry on with setup, name taken from Google
  useEffect(() => {
    if (sync.status !== 'synced' || !sync.user) return
    setP((x) => (x.name ? x : { ...x, name: sync.user!.displayName?.split(' ')[0] ?? '' }))
    setStep((st) => (st === 0 ? 1 : st))
  }, [sync.status, sync.user])

  const nums = { age: Number(p.age), heightCm: Number(p.heightCm), kg: Number(p.kg) }
  const bodyOk = nums.age >= 12 && nums.age <= 90 && nums.heightCm >= 120 && nums.heightCm <= 230 && nums.kg >= 30 && nums.kg <= 300
  const t = bodyOk ? targetsFor({ ...p, ...nums }) : null
  const water = Math.min(4000, Math.max(2000, Math.round((nums.kg * 35) / 250) * 250))
  const targetKg = Number(p.targetKg) || (p.goalType === 'cut' ? Math.round(nums.kg * 0.85) : p.goalType === 'bulk' ? Math.round(nums.kg * 1.08) : nums.kg)

  const finish = async () => {
    if (!t) return
    await db.weights.put({ date: today(), kg: nums.kg })
    await saveSettings({
      onboarded: true, name: p.name.trim(), sex: p.sex, age: nums.age, heightCm: nums.heightCm, activity: p.activity, goalType: p.goalType, trainDays: p.trainDays,
      goal: t.goal, protein: t.protein, greenMax: t.greenMax, amberMax: t.amberMax, maintenance: t.maintenance, ratePerWeek: t.ratePerWeek,
      waterGoal: water, startDate: today(), startKg: nums.kg, targetKg,
    })
  }
  const doRestore = async (f?: File) => {
    if (!f) return
    try { await restore(f); toast(L('✅ البيانات رجعت', '✅ Data restored')) } catch (e) { toast(`⚠️ ${(e as Error).message}`) }
  }
  const switchLang = (l: 'ar' | 'en') => {
    if (l === lang) return
    try { localStorage.setItem('lang', l) } catch { /* private mode */ }
    location.reload()
  }

  const steps: { ok: boolean; body: ReactNode }[] = [
    {
      ok: true,
      body: (
        <>
          <p className="mb-2 text-[56px]">💪</p>
          <h1 className="mb-2 text-[34px] leading-[1.05] font-bold tracking-tight">Mini's Coach</h1>
          <p className="mb-8 text-[17px] text-ink-2">{L('أكلك، تمرينك، ووزنك — في مكان واحد', 'Your food, training and weight — in one place')}</p>
          <Seg value={lang} onChange={switchLang} options={[['ar', 'عربي مصري'], ['en', 'English']]} />
          <div className="mt-8 flex w-full flex-col gap-3 text-[15px]">
            {sync.user
              ? <p className="rounded-full bg-fill py-3 font-medium">{sync.status === 'syncing' ? L('⏳ بنجيب بياناتك…', '⏳ Fetching your data…') : `✓ ${sync.user.displayName}`}</p>
              : <GoogleButton label={L('المتابعة بحساب Google', 'Continue with Google')} onClick={() => signIn().catch((e: Error) => toast(`⚠️ ${e.message}`))} />}
            {!sync.user && <button className="press py-1 text-ink-2" onClick={() => setStep(1)}>{L('كمّل من غير حساب', 'Continue without an account')}</button>}
            <button className="press py-1 text-[14px] text-ink-3" onClick={() => file.current?.click()}>{L('عندي ملف باك أب', 'I have a backup file')}</button>
            <input ref={file} type="file" accept="application/json,text/plain,.json,.txt" hidden onChange={(e) => { doRestore(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </>
      ),
    },
    {
      ok: p.name.trim().length > 0,
      body: (
        <>
          <H>{L('اسمك إيه؟', "What's your name?")}</H>
          <input className="field mb-6 text-[22px]" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder={L('الاسم', 'Name')} autoFocus autoComplete="given-name" />
          <p className="label mb-2">{L('النوع (عشان حساب السعرات)', 'Sex (for the calorie formula)')}</p>
          <Seg value={p.sex} onChange={(sex) => set({ sex })} options={[['m', L('ذكر', 'Male')], ['f', L('أنثى', 'Female')]]} />
        </>
      ),
    },
    {
      ok: bodyOk,
      body: (
        <>
          <H>{L('شوية أرقام عنك', 'A few numbers')}</H>
          <div className="grid grid-cols-3 gap-3">
            <Num label={L('السن', 'Age')} value={p.age} onChange={(age) => set({ age })} />
            <Num label={L('الطول (سم)', 'Height (cm)')} value={p.heightCm} onChange={(heightCm) => set({ heightCm })} />
            <Num label={L('الوزن (كجم)', 'Weight (kg)')} value={p.kg} onChange={(kg) => set({ kg })} decimal />
          </div>
          <p className="mt-4 text-[13px] text-ink-3">{L('اوزن نفسك الصبح بعد الحمام وقبل الأكل لأدق رقم.', 'Weigh in the morning, after the bathroom and before eating.')}</p>
        </>
      ),
    },
    {
      ok: true,
      body: (
        <>
          <H>{L('يومك عامل إزاي؟', 'How active are you?')}</H>
          <div className="flex flex-col gap-2">
            {ACTIVITY.map((a) => (
              <button key={a.v} className={`press rounded-2xl p-3.5 text-start ${p.activity === a.v ? 'bg-accent text-white' : 'bg-fill'}`} onClick={() => set({ activity: a.v })} aria-pressed={p.activity === a.v}>
                <p className="font-semibold">{L(a.ar, a.en)}</p>
                <p className={`text-[13px] ${p.activity === a.v ? 'text-white/80' : 'text-ink-2'}`}>{L(a.subAr, a.subEn)}</p>
              </button>
            ))}
          </div>
        </>
      ),
    },
    {
      ok: true,
      body: (
        <>
          <H>{L('هدفك إيه؟', "What's your goal?")}</H>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {GOALS.map((g) => (
              <button key={g.v} className={`press rounded-2xl px-2 py-4 ${p.goalType === g.v ? 'bg-accent text-white' : 'bg-fill'}`} onClick={() => set({ goalType: g.v, targetKg: '' })} aria-pressed={p.goalType === g.v}>
                <span className="block text-[26px]">{g.emoji}</span>
                <span className="text-[14px] font-semibold">{L(g.ar, g.en)}</span>
              </button>
            ))}
          </div>
          {p.goalType !== 'maintain' && (
            <div className="mb-5"><Num label={L('الوزن اللي عايز توصله (كجم)', 'Target weight (kg)')} value={p.targetKg} placeholder={String(targetKg)} onChange={(targetKg) => set({ targetKg })} decimal /></div>
          )}
          <p className="label mb-2">{L('هتتمرن كام يوم في الأسبوع؟', 'Training days per week?')}</p>
          <Seg value={String(p.trainDays)} onChange={(d) => set({ trainDays: Number(d) })} options={[2, 3, 4, 5, 6].map((d) => [String(d), String(d)] as [string, string])} />
        </>
      ),
    },
    {
      ok: !!t,
      body: t && (
        <>
          <H>{L(`جاهز يا ${p.name.trim()} 🎯`, `You're set, ${p.name.trim()} 🎯`)}</H>
          <div className="card mb-3 text-center">
            <p className="label">{L('هدفك اليومي', 'Daily target')}</p>
            <p className="num text-[56px] text-accent">{t.goal}</p>
            <p className="text-[14px] text-ink-2">{L('سعر في اليوم', 'kcal / day')} · {L('الصيانة', 'maintenance')} <span className="num">{t.maintenance}</span></p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={L('بروتين', 'Protein')} value={`${t.protein}${L('ج', 'g')}`} />
            <Stat label={L('مية', 'Water')} value={`${water / 1000}${L('ل', 'L')}`} />
            <Stat label={L('في الأسبوع', 'Per week')} value={`${p.goalType === 'bulk' ? '+' : p.goalType === 'cut' ? '−' : '±'}${t.ratePerWeek || 0}${L('ك', 'kg')}`} />
          </div>
          <p className="mt-4 text-[13px] text-ink-3">{L('بعد أسبوعين تسجيل التطبيق هيضبط الأرقام دي على جسمك الحقيقي. تقدر تغيرها من الإعدادات.', 'After two weeks of logging the app tunes these to your real body. You can change them in Settings.')}</p>
        </>
      ),
    },
  ]
  const cur = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
      {step > 0 && (
        <div className="mb-6 flex gap-1.5" aria-hidden>
          {steps.slice(1).map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-fill'}`} style={{ transition: 'background 300ms' }} />)}
        </div>
      )}
      <div key={step} className={`pop-enter flex-1 ${step === 0 ? 'flex flex-col items-center justify-center text-center' : ''}`}>{cur.body}</div>
      <div className="flex gap-2" hidden={step === 0}>
        {step > 0 && <button className="press rounded-2xl bg-fill px-5 py-3.5 font-semibold" onClick={() => setStep(step - 1)}>{L('رجوع', 'Back')}</button>}
        <button className="press flex-1 rounded-2xl bg-accent py-3.5 text-[17px] font-semibold text-white disabled:opacity-40" disabled={!cur.ok}
          onClick={() => (last ? finish() : setStep(step + 1))}>
          {step === 0 ? L('يلا نبدأ', "Let's start") : last ? L('ابدأ', 'Start') : L('التالي', 'Next')}
        </button>
      </div>
    </div>
  )
}

const H = ({ children }: { children: ReactNode }) => <h2 className="mb-5 text-[28px] leading-[1.1] font-bold tracking-tight">{children}</h2>

function Num({ label, value, onChange, decimal, placeholder }: { label: string; value: string; onChange: (v: string) => void; decimal?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field num mt-1 text-center text-[22px]" inputMode={decimal ? 'decimal' : 'numeric'} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="card !p-3">
    <p className="num text-[20px]">{value}</p>
    <p className="text-[12px] text-ink-2">{label}</p>
  </div>
)
