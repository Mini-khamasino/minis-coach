import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudUpload, Download, Check } from 'lucide-react'
import { db, saveSettings, ACCENTS, type Accent, type Settings } from '../lib/db.ts'
import { backup, prepareBackup, restore, daysSinceBackup } from '../lib/backup.ts'
import { targetsFor } from '../lib/calc.ts'
import { signIn, logOut, pullFromCloud, type SyncState } from '../lib/syncCore.ts'
import { L, lang, locale } from '../lib/i18n.ts'
import { Sheet, Seg, GoogleButton, toast } from './ui.tsx'

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]

// swatch colors (dark-mode values; the live accent adapts per theme in CSS)
const SWATCH: Record<Accent, string> = {
  blue: '#0a84ff', green: '#30d158', purple: '#bf5af2', pink: '#ff375f', orange: '#ff9f0a', teal: '#40c8e0', red: '#ff453a', graphite: '#8e8e93',
}

export function SettingsSheet({ s, sync, onClose }: { s: Settings; sync: SyncState; onClose: () => void }) {
  const [form, setForm] = useState(s)
  const file = useRef<HTMLInputElement>(null)
  const lastKg = useLiveQuery(() => db.weights.orderBy('date').last())?.kg ?? s.startKg

  // fields that change instantly (theme, accent, lastBackup) are saved on tap, so never overwrite them from this form copy
  const save = async () => {
    const { theme: _t, accent: _a, lastBackup: _b, lang: _l, ...rest } = form
    await saveSettings({ ...rest, name: form.name.trim() })
    toast(L('✅ اتحفظ', '✅ Saved'))
    onClose()
  }
  const recalc = () => {
    const t = targetsFor({ sex: form.sex, age: form.age, heightCm: form.heightCm, kg: lastKg, activity: form.activity, goalType: form.goalType })
    setForm({ ...form, goal: t.goal, protein: t.protein, greenMax: t.greenMax, amberMax: t.amberMax, maintenance: t.maintenance, ratePerWeek: t.ratePerWeek })
    toast(L(`🎯 ${t.goal} سعر — دوس حفظ`, `🎯 ${t.goal} kcal — tap Save`))
  }
  const switchLang = (l: 'ar' | 'en') => {
    if (l === lang) return
    try { localStorage.setItem('lang', l) } catch { /* private mode */ }
    saveSettings({ lang: l }).then(() => location.reload())
  }

  const [backupFile, setBackupFile] = useState<File | null>(null)
  useEffect(() => { prepareBackup().then(setBackupFile, () => {}) }, [])
  const doBackup = async () => {
    if (!backupFile) return toast(L('لحظة، بجهز الباك أب…', 'One moment, preparing…'))
    try {
      const r = await backup(backupFile)
      if (r !== 'cancelled') toast(r === 'shared' ? L('☁️ اختار Drive من القايمة', '☁️ Pick Drive from the list') : L('⬇️ اتنزل', '⬇️ Downloaded'))
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    }
  }
  const doRestore = async (f?: File) => {
    if (!f) return
    if (!confirm(L('ده هيمسح كل البيانات الحالية ويحط اللي في الملف. متأكد؟', 'This replaces all current data with the file. Sure?'))) return
    try {
      await restore(f)
      toast(L('✅ البيانات رجعت', '✅ Data restored'))
      onClose()
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    }
  }

  const n = (k: NumKey, label: string, step = '1') => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field num mt-1" type="number" step={step} inputMode="decimal" value={form[k] ?? ''}
        onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
    </label>
  )
  const age = daysSinceBackup(s.lastBackup)

  return (
    <Sheet title={L('الإعدادات', 'Settings')} onClose={onClose}>
      <Group title={L('الحساب', 'Account')}>
          {sync.user ? (
            <>
            <div className="flex items-center gap-3 rounded-2xl bg-fill p-3">
              {sync.user.photoURL && <img src={sync.user.photoURL} alt="" className="size-10 rounded-full" referrerPolicy="no-referrer" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{sync.user.displayName}</p>
                <p className="text-[13px] text-ink-2">{{ idle: '', syncing: L('⏳ بيزامن…', '⏳ Syncing…'), synced: L('☁️ متزامن', '☁️ Synced'), error: L('⚠️ المزامنة وقفت', '⚠️ Sync stopped') }[sync.status]}</p>
              </div>
              <button className="press rounded-xl px-3 py-1.5 text-[14px] text-red" onClick={() => logOut()}>{L('خروج', 'Sign out')}</button>
            </div>
            <button className="press rounded-2xl bg-fill py-2.5 text-[14px] text-accent" onClick={async () => {
              if (!confirm(L('هجيب بياناتك من الحساب وأحطها على الموبايل ده. كمّل؟', 'Bring your account data onto this phone?'))) return
              try { await pullFromCloud(); toast(L('✅ بياناتك رجعت', '✅ Your data is here')) } catch (e) { toast(`⚠️ ${(e as Error).message}`) }
            }}>⬇️ {L('هات بياناتي من الحساب', 'Get my data from my account')}</button>
            </>
          ) : (
            <>
              <GoogleButton label={L('المتابعة بحساب Google', 'Continue with Google')} onClick={() => signIn().catch((e: Error) => toast(`⚠️ ${e.message}`))} />
              <p className="text-center text-[12px] text-ink-3">{L('بياناتك تتحفظ أونلاين وترجع على أي موبايل', 'Your data is backed up and restores on any phone')}</p>
            </>
          )}
        </Group>

      <Group title={L('المظهر', 'Appearance')}>
        <Seg value={s.theme} onChange={(theme) => saveSettings({ theme })} options={[['system', L('تلقائي', 'Auto')], ['dark', L('غامق', 'Dark')], ['light', L('فاتح', 'Light')]]} />
        <div className="flex justify-between gap-1 px-1" role="radiogroup" aria-label={L('اللون', 'Accent color')}>
          {ACCENTS.map((a) => (
            <button key={a} role="radio" aria-checked={s.accent === a} aria-label={a} onClick={() => saveSettings({ accent: a })}
              className="press grid size-9 place-items-center rounded-full" style={{ background: SWATCH[a], boxShadow: s.accent === a ? `0 0 0 3px var(--color-canvas), 0 0 0 5px ${SWATCH[a]}` : undefined }}>
              {s.accent === a && <Check size={18} color="#fff" strokeWidth={3} />}
            </button>
          ))}
        </div>
        <Seg value={lang} onChange={switchLang} options={[['ar', 'عربي مصري'], ['en', 'English']]} />
      </Group>

      <Group title={L('أنت', 'You')}>
        <label className="block">
          <span className="label">{L('الاسم', 'Name')}</span>
          <input className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <Seg value={form.goalType} onChange={(goalType) => setForm({ ...form, goalType })} options={[['cut', L('أخس', 'Lose')], ['maintain', L('أحافظ', 'Maintain')], ['bulk', L('أزود عضل', 'Build')]]} />
        <div className="grid grid-cols-3 gap-3">
          {n('age', L('السن', 'Age'))}
          {n('heightCm', L('الطول', 'Height'))}
          {n('trainDays', L('أيام التمرين', 'Train days'))}
        </div>
        <label className="block">
          <span className="label">{L('النشاط', 'Activity')}</span>
          <select className="field mt-1" value={form.activity} onChange={(e) => setForm({ ...form, activity: Number(e.target.value) })}>
            <option value={1.2}>{L('قاعد معظم اليوم', 'Mostly sitting')}</option>
            <option value={1.375}>{L('حركة خفيفة (1–3 تمرين)', 'Light (1–3 workouts)')}</option>
            <option value={1.55}>{L('نشيط (3–5 جيم)', 'Active (3–5 gym)')}</option>
            <option value={1.725}>{L('نشيط جداً (6–7)', 'Very active (6–7)')}</option>
          </select>
        </label>
        <button className="press rounded-2xl bg-fill py-2.5 font-semibold text-accent" onClick={recalc}>{L('🎯 احسب أهدافي تاني', '🎯 Recalculate my targets')}</button>
      </Group>

      <Group title={L('الأهداف', 'Targets')}>
        <div className="grid grid-cols-2 gap-3">
          {n('goal', L('سعرات اليوم', 'Daily kcal'))}
          {n('protein', L('بروتين (ج)', 'Protein (g)'))}
          {n('greenMax', L('أخضر لحد', 'Green up to'))}
          {n('amberMax', L('برتقالي لحد', 'Amber up to'))}
          {n('maintenance', L('الصيانة', 'Maintenance'))}
          {n('waterGoal', L('مية (مل)', 'Water (ml)'))}
          {n('startKg', L('وزن البداية', 'Start weight'), '0.1')}
          {n('targetKg', L('الوزن المستهدف', 'Target weight'), '0.1')}
        </div>
      </Group>

      <button className="press mb-6 w-full rounded-2xl bg-accent py-3 font-semibold text-white" onClick={save}>{L('حفظ', 'Save')}</button>

      <Group title={L('باك أب', 'Backup')}>
        <p className="text-[13px] text-ink-2">{age === null ? L('لسه معملتش باك أب', 'No backup yet') : age === 0 ? L('آخر باك أب: النهارده', 'Last backup: today') : L(`آخر باك أب: من ${age} يوم`, `Last backup: ${age} days ago`)}</p>
        <div className="flex gap-2">
          <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-fill py-3" onClick={doBackup}><CloudUpload size={18} /> {L('باك أب', 'Back up')}</button>
          <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-fill py-3" onClick={() => file.current?.click()}><Download size={18} /> {L('استرجاع', 'Restore')}</button>
        </div>
        <input ref={file} type="file" accept="application/json,text/plain,.json,.txt" hidden onChange={(e) => { doRestore(e.target.files?.[0]); e.target.value = '' }} />
      </Group>

      <p className="pb-2 text-center text-[12px] text-ink-3">
        Mini's Coach <span className="num">v{__APP_VERSION__}</span> · {new Date(__BUILD_TIME__).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
      </p>
    </Sheet>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold tracking-wide text-ink-2">{title}</h3>
      {children}
    </section>
  )
}
