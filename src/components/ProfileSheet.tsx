import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, CloudUpload, Download } from 'lucide-react'
import { db, saveSettings, DEMO, ACCENTS, type Accent, type Settings } from '../lib/db.ts'
import { backup, prepareBackup, restore } from '../lib/backup.ts'
import { targetsFor } from '../lib/calc.ts'
import { signIn, logOut, pullFromCloud, backupNow, setFlag, sendFeedback, type SyncState, type Flags } from '../lib/syncCore.ts'
import { L, lang, locale } from '../lib/i18n.ts'
import { Sheet, Seg, GoogleButton, Toggle, toast } from './ui.tsx'
import { ProgramPicker } from './ProgramPicker.tsx'

type Page = 'root' | 'goals' | 'body' | 'training' | 'ai' | 'look' | 'data' | 'about' | 'dev' | 'feedback'
type NumKey = { [K in keyof Settings]-?: Settings[K] extends number ? K : never }[keyof Settings]

const SWATCH: Record<Accent, string> = {
  blue: '#0a84ff', green: '#30d158', purple: '#bf5af2', pink: '#ff375f', orange: '#ff9f0a', teal: '#40c8e0', red: '#ff453a', graphite: '#8e8e93',
}

/** Profile = iOS-style Settings: account on top, short grouped rows, each opening its own page. */
export function ProfileSheet({ s, sync, features, onClose }: { s: Settings; sync: SyncState; features: Flags & { admin: boolean }; onClose: () => void }) {
  const [page, setPage] = useState<Page>('root')
  const titles: Record<Page, string> = {
    root: L('البروفايل', 'Profile'), goals: L('أهدافي', 'My targets'), body: L('جسمي', 'My body'), training: L('التمرين', 'Training'),
    ai: L('الكوتش والـ AI', 'Coach & AI'), look: L('المظهر', 'Appearance'), data: L('بياناتي', 'My data'), about: L('عن التطبيق', 'About'), dev: L('المطور', 'Developer'), feedback: L('رأيك يهمنا', 'Feedback'),
  }
  const back = page === 'root' ? undefined : () => setPage('root')
  return (
    <Sheet title={titles[page]} onClose={onClose} onBack={back}>
      <div key={page} className="fade-enter">
        {page === 'root' && <Root s={s} sync={sync} admin={features.admin} feedbackAllowed={features.feedback} go={setPage} />}
        {page === 'feedback' && <FeedbackPage done={() => setPage('root')} />}
        {page === 'goals' && <Goals s={s} done={() => setPage('root')} />}
        {page === 'body' && <Body s={s} done={() => setPage('root')} />}
        {page === 'training' && <ProgramPicker s={s} />}
        {page === 'ai' && <AiPage s={s} available={features.ai} signedIn={!!sync.user} />}
        {page === 'look' && <Look s={s} />}
        {page === 'data' && <Data s={sync} />}
        {page === 'about' && <About />}
        {page === 'dev' && features.admin && <Dev />}
      </div>
    </Sheet>
  )
}

function Root({ s, sync, admin, feedbackAllowed, go }: { s: Settings; sync: SyncState; admin: boolean; feedbackAllowed: boolean; go: (p: Page) => void }) {
  const u = sync.user
  return (
    <>
      <section className="mb-5 flex flex-col items-center gap-2 text-center">
        <div className="grid size-20 place-items-center overflow-hidden rounded-full bg-fill text-[32px] font-semibold">
          {u?.photoURL ? <img src={u.photoURL} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : (s.name || 'M').slice(0, 1).toUpperCase()}
        </div>
        <p className="text-[22px] leading-tight font-semibold">{s.name || u?.displayName || "Mini's Coach"}</p>
        {u ? (
          <p className="text-[13px] text-ink-2">{u.email} · {DEMO ? L('🧪 وضع التجربة', '🧪 Test mode') : { idle: '', syncing: L('⏳ بيزامن…', '⏳ Syncing…'), synced: L('☁️ متزامن', '☁️ Synced'), error: L('⚠️ المزامنة وقفت', '⚠️ Sync stopped') }[sync.status]}</p>
        ) : (
          <div className="mt-2 w-full"><GoogleButton label={L('المتابعة بحساب Google', 'Continue with Google')} onClick={() => signIn().catch((e: Error) => toast(`⚠️ ${e.message}`))} /></div>
        )}
      </section>

      <Rows>
        <Row icon="🎯" label={L('أهدافي', 'My targets')} value={`${s.goal} ${L('سعر', 'kcal')}`} onClick={() => go('goals')} />
        <Row icon="🧍" label={L('جسمي', 'My body')} value={`${s.heightCm} ${L('سم', 'cm')} · ${s.age}`} onClick={() => go('body')} />
        <Row icon="🏋️" label={L('التمرين', 'Training')} value={`${s.trainDays}× ${s.place === 'gym' ? L('جيم', 'gym') : L('بيت', 'home')}`} onClick={() => go('training')} />
      </Rows>
      <Rows>
        <Row icon="✨" label={L('الكوتش والـ AI', 'Coach & AI')} onClick={() => go('ai')} />
        <Row icon="🎨" label={L('المظهر', 'Appearance')} onClick={() => go('look')} />
        <Row icon="☁️" label={L('بياناتي', 'My data')} onClick={() => go('data')} />
      </Rows>
      <Rows>
        {feedbackAllowed && <Row icon="💬" label={L('رأيك يهمنا', 'Send feedback')} onClick={() => go('feedback')} />}
        <Row icon="ℹ️" label={L('عن التطبيق', 'About')} value={`v${__APP_VERSION__}`} onClick={() => go('about')} />
        {admin && <Row icon="🧪" label={L('المطور', 'Developer')} onClick={() => go('dev')} />}
      </Rows>
      {u && <button className="press mt-2 w-full rounded-2xl py-3 text-[15px] text-red" onClick={() => logOut()}>{L('تسجيل خروج', 'Sign out')}</button>}
    </>
  )
}

const Rows = ({ children }: { children: ReactNode }) => <div className="mb-4 overflow-hidden rounded-2xl bg-fill">{children}</div>

function Row({ icon, label, value, onClick }: { icon: string; label: string; value?: string; onClick: () => void }) {
  return (
    <button className="press flex w-full items-center gap-3 border-b border-hair px-3.5 py-3 text-start last:border-0" onClick={onClick}>
      <span className="text-[19px]" aria-hidden>{icon}</span>
      <span className="flex-1 text-[16px]">{label}</span>
      {value && <span className="num text-[14px] text-ink-2">{value}</span>}
      {lang === 'ar' ? <ChevronLeft size={18} className="text-ink-3" /> : <ChevronRight size={18} className="text-ink-3" />}
    </button>
  )
}

function useForm(s: Settings) {
  const [form, setForm] = useState(s)
  const n = (k: NumKey, label: string, step = '1') => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field num mt-1" type="number" step={step} inputMode="decimal" value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
    </label>
  )
  return { form, setForm, n }
}

const SaveBtn = ({ onClick }: { onClick: () => void }) => <button className="press mt-5 w-full rounded-2xl bg-accent py-3 font-semibold text-white" onClick={onClick}>{L('حفظ', 'Save')}</button>

function Goals({ s, done }: { s: Settings; done: () => void }) {
  const { form, setForm, n } = useForm(s)
  const lastKg = useLiveQuery(() => db.weights.orderBy('date').last())?.kg ?? s.startKg
  const recalc = () => {
    const t = targetsFor({ sex: form.sex, age: form.age, heightCm: form.heightCm, kg: lastKg, activity: form.activity, goalType: form.goalType })
    setForm({ ...form, ...t })
    toast(L(`🎯 ${t.goal} سعر — دوس حفظ`, `🎯 ${t.goal} kcal — tap Save`))
  }
  const save = async () => {
    const { goal, protein, greenMax, amberMax, maintenance, waterGoal, startKg, targetKg, ratePerWeek } = form
    await saveSettings({ goal, protein, greenMax, amberMax, maintenance, waterGoal, startKg, targetKg, ratePerWeek })
    toast(L('✅ اتحفظ', '✅ Saved')); done()
  }
  return (
    <>
      <button className="press mb-4 w-full rounded-2xl bg-fill py-2.5 font-semibold text-accent" onClick={recalc}>{L('🎯 احسبهم تاني من جسمي وهدفي', '🎯 Recalculate from my body and goal')}</button>
      <div className="grid grid-cols-2 gap-3">
        {n('goal', L('سعرات اليوم', 'Daily kcal'))}
        {n('protein', L('بروتين (ج)', 'Protein (g)'))}
        {n('waterGoal', L('مية (مل)', 'Water (ml)'))}
        {n('maintenance', L('الصيانة', 'Maintenance'))}
        {n('greenMax', L('أخضر لحد', 'Green up to'))}
        {n('amberMax', L('برتقالي لحد', 'Amber up to'))}
        {n('startKg', L('وزن البداية', 'Start weight'), '0.1')}
        {n('targetKg', L('الوزن المستهدف', 'Target weight'), '0.1')}
      </div>
      <SaveBtn onClick={save} />
    </>
  )
}

function Body({ s, done }: { s: Settings; done: () => void }) {
  const { form, setForm, n } = useForm(s)
  const save = async () => {
    await saveSettings({ name: form.name.trim(), sex: form.sex, age: form.age, heightCm: form.heightCm, activity: form.activity, goalType: form.goalType })
    toast(L('✅ اتحفظ — لو غيرت الهدف احسب أهدافك تاني', '✅ Saved — recalculate your targets if the goal changed')); done()
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="block"><span className="label">{L('الاسم', 'Name')}</span>
        <input className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <Seg value={form.sex} onChange={(sex) => setForm({ ...form, sex })} options={[['m', L('ذكر', 'Male')], ['f', L('أنثى', 'Female')]]} />
      <div className="grid grid-cols-2 gap-3">{n('age', L('السن', 'Age'))}{n('heightCm', L('الطول (سم)', 'Height (cm)'))}</div>
      <p className="label">{L('الهدف', 'Goal')}</p>
      <Seg value={form.goalType} onChange={(goalType) => setForm({ ...form, goalType })} options={[['cut', L('أخس', 'Lose')], ['maintain', L('أحافظ', 'Maintain')], ['bulk', L('أزود عضل', 'Build')]]} />
      <label className="block"><span className="label">{L('النشاط', 'Activity')}</span>
        <select className="field mt-1" value={form.activity} onChange={(e) => setForm({ ...form, activity: Number(e.target.value) })}>
          <option value={1.2}>{L('قاعد معظم اليوم', 'Mostly sitting')}</option>
          <option value={1.375}>{L('حركة خفيفة (1–3 تمرين)', 'Light (1–3 workouts)')}</option>
          <option value={1.55}>{L('نشيط (3–5 جيم)', 'Active (3–5 gym)')}</option>
          <option value={1.725}>{L('نشيط جداً (6–7)', 'Very active (6–7)')}</option>
        </select></label>
      <SaveBtn onClick={save} />
    </div>
  )
}

function AiPage({ s, available, signedIn }: { s: Settings; available: boolean; signedIn: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Toggle label={L('مساعد AI', 'AI assistant')} on={s.aiEnabled && available} disabled={!available} onChange={(aiEnabled) => saveSettings({ aiEnabled })}
        sub={!signedIn ? L('محتاج تسجل دخول الأول', 'Sign in first') : !available ? L('لسه مش متاح — جاي قريب', 'Not available yet — coming soon') : L('اكتب أي حاجة: يسجل أكلك ويرد على أسئلتك', 'Type anything: logs your food and answers questions')} />
      <div className="rounded-2xl bg-fill p-3.5 text-[13px] leading-relaxed text-ink-2">
        <p className="mb-1 font-semibold text-ink">🔒 {L('الخصوصية', 'Privacy')}</p>
        <p>{L('الـ AI مش بيعرف اسمك ولا إيميلك ولا صورتك — بيشوف أرقام بس (سن، وزن، أكل). الرسايل بتروح لـ Groq اللي مش بيتدرب عليها ومش بيحتفظ بيها.', "The AI never sees your name, email or photo — only numbers (age, weight, food). Messages go to Groq, which doesn't train on them or keep them.")}</p>
        <p className="mt-1">{L('المواضيع الشخصية (صحة، أدوية، نفسية…) مش بتتبعت خالص — التطبيق بيعملك برومبت تسأل بيه الـ AI بتاعك.', 'Personal topics (health, medicines, mental health…) are never sent — the app builds a prompt for your own AI instead.')}</p>
      </div>
      <p className="px-1 text-[12px] text-ink-3">{L('الكوتش العادي (رسايل اليوم والأسئلة البسيطة) شغال من غير AI ومن غير نت.', 'The regular coach (daily messages, simple questions) works without AI and offline.')}</p>
    </div>
  )
}

function FeedbackPage({ done }: { done: () => void }) {
  const [type, setType] = useState<'bug' | 'idea' | 'other'>('bug')
  const [text, setText] = useState('')
  const [doing, setDoing] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!text.trim()) {
      toast(L('اكتب ملاحظتك الأول', 'Please write your feedback first'))
      return
    }
    setSending(true)
    try {
      await sendFeedback({ type, text: text.trim(), doing: doing.trim() || undefined })
      toast(L('شكراً! ملاحظتك وصلت ❤️', 'Thanks! Your feedback was received ❤️'))
      done()
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="label">{L('النوع', 'Type')}</p>
      <Seg
        value={type}
        onChange={(v) => setType(v as 'bug' | 'idea' | 'other')}
        options={[
          ['bug', L('🐞 مشكلة', '🐞 Bug')],
          ['idea', L('💡 فكرة', '💡 Idea')],
          ['other', L('💬 حاجة تانية', '💬 Other')],
        ]}
      />
      <label className="block">
        <span className="label">{L('الملاحظة', 'Feedback')}</span>
        <textarea
          rows={4}
          className="field mt-1 resize-none"
          placeholder={L('اكتب اللي فبالك بالتفصيل…', 'Write your thoughts in detail…')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="label">{L('اللي كنت بتعمله (اختياري)', 'What you were doing (optional)')}</span>
        <input
          className="field mt-1"
          placeholder={L('مثلاً: بسجل فطار، بفتح تمرين…', 'e.g. logging breakfast, opening a workout…')}
          value={doing}
          onChange={(e) => setDoing(e.target.value)}
        />
      </label>
      <button
        disabled={sending}
        className="press mt-3 w-full rounded-2xl bg-accent py-3 font-semibold text-white disabled:opacity-50"
        onClick={submit}
      >
        {sending ? L('بيتبعت…', 'Sending…') : L('إرسال', 'Send')}
      </button>
    </div>
  )
}

function Look({ s }: { s: Settings }) {
  const switchLang = (l: 'ar' | 'en') => {
    if (l === lang) return
    try { localStorage.setItem('lang', l) } catch { /* private mode */ }
    saveSettings({ lang: l }).then(() => location.reload())
  }
  return (
    <div className="flex flex-col gap-4">
      <div><p className="label mb-2">{L('الوضع', 'Mode')}</p>
        <Seg value={s.theme} onChange={(theme) => saveSettings({ theme })} options={[['system', L('تلقائي', 'Auto')], ['dark', L('غامق', 'Dark')], ['light', L('فاتح', 'Light')]]} /></div>
      <div><p className="label mb-2">{L('اللون', 'Color')}</p>
        <div className="flex justify-between gap-1 px-1" role="radiogroup" aria-label={L('اللون', 'Accent color')}>
          {ACCENTS.map((a) => (
            <button key={a} role="radio" aria-checked={s.accent === a} aria-label={a} onClick={() => saveSettings({ accent: a })}
              className="press grid size-9 place-items-center rounded-full" style={{ background: SWATCH[a], boxShadow: s.accent === a ? `0 0 0 3px var(--color-surface), 0 0 0 5px ${SWATCH[a]}` : undefined }}>
              {s.accent === a && <Check size={18} color="#fff" strokeWidth={3} />}
            </button>
          ))}
        </div></div>
      <div><p className="label mb-2">{L('اللغة', 'Language')}</p>
        <Seg value={lang} onChange={switchLang} options={[['ar', 'عربي مصري'], ['en', 'English']]} /></div>
      <Toggle label={L('الشفافية', 'Transparency')} sub={L('اقفلها لو حاجة مش باينة كويس', 'Turn off if anything is hard to read')} on={s.transparency} onChange={(transparency) => saveSettings({ transparency })} />
    </div>
  )
}

function Data({ s: sync }: { s: SyncState }) {
  const file = useRef<HTMLInputElement>(null)
  const [backupFile, setBackupFile] = useState<File | null>(null)
  useEffect(() => { prepareBackup().then(setBackupFile, () => {}) }, [])
  const doFile = async () => {
    if (!backupFile) return toast(L('لحظة…', 'One moment…'))
    try { const r = await backup(backupFile); if (r !== 'cancelled') toast(L('⬇️ الملف جاهز', '⬇️ File ready')) } catch (e) { toast(`⚠️ ${(e as Error).message}`) }
  }
  const doRestore = async (f?: File) => {
    if (!f || !confirm(L('ده هيمسح البيانات اللي على الموبايل ويحط اللي في الملف. متأكد؟', 'This replaces the data on this phone with the file. Sure?'))) return
    try { await restore(f); toast(L('✅ البيانات رجعت', '✅ Data restored')) } catch (e) { toast(`⚠️ ${(e as Error).message}`) }
  }
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => toast(ok), (e: Error) => toast(`⚠️ ${e.message}`))
  return (
    <div className="flex flex-col gap-3">
      {DEMO ? (
        <p className="rounded-2xl bg-fill p-3.5 text-[14px] text-amber">🧪 {L('وضع التجربة: البيانات دي تجريبية ومش بتتزامن مع حسابك.', "Test mode: this is sample data and doesn't sync to your account.")}</p>
      ) : sync.user ? (
        <>
          <p className="rounded-2xl bg-fill p-3.5 text-[14px] text-ink-2">☁️ {L('كل حاجة بتتحفظ على حسابك أوتوماتيك أول بأول.', 'Everything saves to your account automatically as you go.')}</p>
          <button className="press flex items-center justify-center gap-2 rounded-2xl bg-fill py-3" onClick={() => run(async () => { await backupNow(); await saveSettings({ lastBackup: Date.now() }) }, L('☁️ اتحفظ على حسابك', '☁️ Saved to your account'))}>
            <CloudUpload size={18} /> {L('احفظ على الحساب دلوقتي', 'Back up to my account now')}</button>
          <button className="press rounded-2xl bg-fill py-3 text-accent" onClick={() => confirm(L('هجيب بياناتك من الحساب للموبايل ده. كمّل؟', 'Bring your account data onto this phone?')) && run(pullFromCloud, L('✅ بياناتك رجعت', '✅ Your data is here'))}>
            ⬇️ {L('هات بياناتي من الحساب', 'Get my data from my account')}</button>
        </>
      ) : (
        <p className="rounded-2xl bg-fill p-3.5 text-[14px] text-amber">{L('سجل دخول من البروفايل عشان بياناتك تتحفظ على حسابك. لحد كده هي على الموبايل ده بس.', 'Sign in on the Profile page to back up to your account. Until then your data is only on this phone.')}</p>
      )}
      <p className="label mt-3">{L('ملف (متقدم)', 'File (advanced)')}</p>
      <div className="flex gap-2">
        <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-fill py-2.5" onClick={doFile}><Download size={17} /> {L('صدّر ملف', 'Export file')}</button>
        <button className="press flex-1 rounded-2xl bg-fill py-2.5" onClick={() => file.current?.click()}>{L('استرجع من ملف', 'Restore from file')}</button>
      </div>
      <input ref={file} type="file" accept="application/json,text/plain,.json,.txt" hidden onChange={(e) => { doRestore(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

function About() {
  return (
    <div className="flex flex-col gap-3 text-center">
      <p className="text-[44px]">💪</p>
      <p className="text-[20px] font-semibold">Mini's Coach</p>
      <p className="text-[13px] text-ink-2">v{__APP_VERSION__} · {new Date(__BUILD_TIME__).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
      <a className="press rounded-2xl bg-fill py-3 text-accent" href="/privacy.html" target="_blank" rel="noreferrer">{L('سياسة الخصوصية', 'Privacy policy')}</a>
      <div className="rounded-2xl bg-fill p-3 text-[12px] leading-relaxed text-ink-2">
        {L('تمارين وصور الأداء مقدمة من مشروع free-exercise-db تحت رخصة النطاق العام (Unlicense).', 'Exercise data and demonstration images provided by free-exercise-db under the public domain (Unlicense).')}
      </div>
      <p className="text-[12px] text-ink-3">Mini Apps</p>
    </div>
  )
}

function Dev() {
  const [flags, setFlags] = useState<Flags | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSummary, setFeedbackSummary] = useState<{ summary: string; taskPrompt: string } | null>(null)
  const [feedbackDocs, setFeedbackDocs] = useState<{ id: string }[]>([])

  const loadFeedbackSummary = async () => {
    setFeedbackLoading(true)
    try {
      const items = (await (await import('../lib/sync.ts')).getFeedback()) as ({ id: string } & Record<string, unknown>)[]
      setFeedbackDocs(items)
      if (!items.length) {
        toast(L('مفيش ملاحظات جديدة', 'No new feedback'))
        setFeedbackSummary(null)
        return
      }
      const res = await (await import('../lib/sync.ts')).summarizeFeedback(items)
      setFeedbackSummary(res)
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    } finally {
      setFeedbackLoading(false)
    }
  }

  const markFeedbackDone = async () => {
    if (!feedbackDocs.length) return
    if (!confirm(L('مسح كل الملاحظات اللي اتلخصت دي؟', 'Delete all these summarized feedback items?'))) return
    try {
      await (await import('../lib/sync.ts')).clearFeedback(feedbackDocs.map((d) => d.id))
      toast(L('✅ اتمسحت', '✅ Deleted'))
      setFeedbackSummary(null)
      setFeedbackDocs([])
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    }
  }
  useEffect(() => {
    let off: (() => void) | undefined
    import('../lib/sync.ts').then((m) => { off = m.watchFlags(setFlags) })
    return () => off?.()
  }, [])
  const flip = (name: keyof Flags, on: boolean) => setFlag(name, on).then(
    () => toast(on ? L('🚀 اتنشر للكل', '🚀 Published to everyone') : L('⏸️ اتقفل للكل', '⏸️ Turned off for everyone')),
    (e: Error) => toast(`⚠️ ${e.message}`),
  )
  return (
    <div className="flex flex-col gap-3">
      <Toggle label={L('🧪 وضع التجربة', '🧪 Test mode')} on={DEMO} onChange={async (on) => { const { setDemo } = await import('../lib/demo.ts'); setDemo(on) }}
        sub={L('بيانات تجريبية منفصلة + كل المزايا الجديدة ليك انت بس. بياناتك الحقيقية متتلمسش.', 'Separate sample data + every new feature, for you only. Your real data is untouched.')} />
      {DEMO && <button className="press rounded-2xl bg-fill py-2.5 text-[14px] text-ink-2" onClick={async () => (await import('../lib/demo.ts')).resetDemo()}>↺ {L('ابدأ بيانات التجربة من الأول', 'Reset the sample data')}</button>}
      <button className="press rounded-2xl bg-fill py-2.5 text-[14px] text-accent" onClick={async () => {
        try {
          const { configured, available } = await (await import('../lib/ai.ts')).checkModels()
          const ok = configured.filter((m) => available.includes(m))
          toast(ok.length === configured.length ? L(`✅ الـ AI شغال — ${ok.length} موديلات`, `✅ AI works — ${ok.length} models`) : `⚠️ ${configured.filter((m) => !available.includes(m)).join(', ')} ${L('مش متاحين', 'unavailable')}`)
        } catch (e) { toast(`⚠️ ${(e as Error).message}`) }
      }}>🔌 {L('اختبر اتصال الـ AI', 'Test the AI connection')}</button>
      <p className="label mt-3">{L('نشر للكل', 'Publish to everyone')}</p>
      <Toggle label={L('✨ مساعد AI', '✨ AI assistant')} on={!!flags?.ai} disabled={!flags} onChange={(on) => flip('ai', on)}
        sub={L('لما تفتحه، أخواتك يشوفوه فوراً من غير تحديث', 'When on, everyone gets it instantly — no update needed')} />

      <Toggle label={L('💬 الملاحظات والشكاوى', '💬 Feedback & error reports')} on={!!flags?.feedback} disabled={!flags} onChange={(on) => flip('feedback', on)}
        sub={L('زرار رأيك يهمنا + إرسال تقارير الأخطاء للمطور', 'Send feedback button + automatic error reporting')} />
      <Toggle label={L('📚 مكتبة التمارين', '📚 Exercise library')} on={!!flags?.library} disabled={!flags} onChange={(on) => flip('library', on)}
        sub={L('مكتبة 870+ تمرين بالأنيميشن والأنشطة الخارجية', '870+ exercise library with animations and sports')} />
      <Toggle label={L('📋 الروتينات والجدول', '📋 Routines & schedule')} on={!!flags?.routines} disabled={!flags} onChange={(on) => flip('routines', on)}
        sub={L('باقات تمارين مخصصة والجدولة الأسبوعية', 'Custom workout routines and weekly schedule')} />
      <Toggle label={L('🧠 كوتش ذكي v2', '🧠 Smart Coach v2')} on={!!flags?.aiV2} disabled={!flags} onChange={(on) => flip('aiV2', on)}
        sub={L('أدوات جديدة للكوتش: حساب وجبات، تمارين، روتينات', 'New tools: portion planning, routines, exercise search')} />

      <p className="label mt-3">{L('📊 ملخص الملاحظات', '📊 Feedback summary')}</p>
      <button
        disabled={feedbackLoading}
        className="press rounded-2xl bg-fill py-2.5 text-[14px] text-accent disabled:opacity-50"
        onClick={loadFeedbackSummary}
      >
        {feedbackLoading ? L('⏳ جاري التلخيص بواسطة AI…', '⏳ Summarizing with AI…') : L('📊 هات ولخص كل الملاحظات والأخطاء', 'Fetch & summarize all feedback')}
      </button>

      {feedbackSummary && (
        <div className="flex flex-col gap-3 rounded-2xl bg-fill p-3.5 text-[13px] leading-relaxed">
          <div className="max-h-60 overflow-y-auto whitespace-pre-wrap font-sans text-ink">
            {feedbackSummary.summary}
          </div>
          <div className="flex gap-2">
            <button
              className="press flex-1 rounded-xl border border-hair bg-surface py-2 font-medium text-accent"
              onClick={() => navigator.clipboard.writeText(feedbackSummary.summary).then(() => toast(L('📋 اتنسخ الملخص', '📋 Summary copied')))}
            >
              {L('نسخ الملخص', 'Copy summary')}
            </button>
            <button
              className="press flex-1 rounded-xl border border-hair bg-surface py-2 font-medium text-accent"
              onClick={() => navigator.clipboard.writeText(feedbackSummary.taskPrompt).then(() => toast(L('📋 اتنسخ برومبت المهمة', '📋 Task prompt copied')))}
            >
              {L('نسخ كبرومبت مهمة', 'Copy task prompt')}
            </button>
          </div>
          <button
            className="press rounded-xl bg-red/15 py-2 font-medium text-red"
            onClick={markFeedbackDone}
          >
            {L('تحديد كمكتمل ومسح من السحابة', 'Mark done & delete from cloud')}
          </button>
        </div>
      )}

    </div>
  )
}
