import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudUpload, Download, X } from 'lucide-react'
import { db, saveSettings, type Settings } from '../lib/db.ts'
import { backup, restore, daysSinceBackup } from '../lib/backup.ts'
import { pickModel } from '../lib/coach.ts'
import { mifflin } from '../lib/calc.ts'
import { Sheet, toast } from './ui.tsx'

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]

export function SettingsSheet({ s, onClose }: { s: Settings; onClose: () => void }) {
  const [form, setForm] = useState(s)
  const file = useRef<HTMLInputElement>(null)
  const notes = useLiveQuery(() => db.notes.toArray()) ?? []
  const lastKg = useLiveQuery(() => db.weights.orderBy('date').last())?.kg ?? s.startKg

  const save = async () => {
    // theme + lastBackup can change while the sheet is open; don't overwrite them with the stale form copy
    const { theme: _t, lastBackup: _b, ...rest } = form
    await saveSettings({ ...rest, apiKey: form.apiKey.trim(), model: form.model.trim() || 'gemini-flash-lite-latest' })
    toast('✅ اتحفظ')
    onClose()
  }
  const [testing, setTesting] = useState(false)
  const testKey = async () => {
    const key = form.apiKey.trim()
    if (!key) return toast('الصق المفتاح الأول')
    setTesting(true)
    try {
      const model = await pickModel(key)
      setForm((f) => ({ ...f, apiKey: key, model }))
      await saveSettings({ apiKey: key, model })
      toast(`✅ المفتاح شغال واتحفظ — ${model}`)
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }
  const doBackup = async () => {
    try {
      const r = await backup()
      if (r !== 'cancelled') toast(r === 'shared' ? '☁️ اختار Drive من القايمة' : '⬇️ اتنزل — ارفعه على الدرايف')
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`)
    }
  }
  const doRestore = async (f?: File) => {
    if (!f) return
    if (!confirm('ده هيمسح كل البيانات الحالية ويحط اللي في الملف. متأكد؟')) return
    try {
      await restore(f)
      toast('✅ البيانات رجعت')
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
    <Sheet title="الإعدادات" onClose={onClose}>
      <Group title="المظهر">
        <div className="flex gap-1 rounded-xl bg-fill p-1" role="radiogroup" aria-label="المظهر">
          {([['system', 'تلقائي'], ['dark', 'غامق'], ['light', 'فاتح']] as const).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={s.theme === v} onClick={() => saveSettings({ theme: v })}
              className={`press flex-1 rounded-lg py-2 text-[14px] ${s.theme === v ? 'glass font-semibold' : 'text-ink-2'}`}>{label}</button>
          ))}
        </div>
      </Group>

      <Group title="Gemini">
        <label className="block">
          <span className="label">المفتاح (من aistudio.google.com)</span>
          <input className="field mt-1 font-mono text-[14px]" type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} dir="ltr" />
        </label>
        <label className="block">
          <span className="label">الموديل — بيتغير لوحده لو جوجل وقفته</span>
          <input className="field mt-1 font-mono text-[14px]" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} dir="ltr" />
        </label>
        <button className="press rounded-2xl bg-fill py-3 font-semibold text-blue disabled:opacity-50" onClick={testKey} disabled={testing}>
          {testing ? 'بجرب…' : 'جرّب المفتاح واحفظه'}
        </button>
      </Group>

      <Group title="الأهداف">
        <div className="grid grid-cols-2 gap-3">
          {n('goal', 'هدف السعرات')}
          {n('protein', 'بروتين (ج)')}
          {n('greenMax', 'أخضر لحد')}
          {n('amberMax', 'برتقالي لحد')}
          {n('maintenance', 'سقف الصيانة')}
          {n('waterGoal', 'مية (مل)')}
        </div>
      </Group>

      <Group title="الوزن والجسم">
        <div className="grid grid-cols-2 gap-3">
          {n('startKg', 'وزن البداية', '0.1')}
          <label className="block"><span className="label">تاريخ البداية</span>
            <input className="field mt-1" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          {n('targetKg', 'الوزن المستهدف', '0.1')}
          {n('ratePerWeek', 'نزول/أسبوع (كجم)', '0.05')}
          {n('heightCm', 'الطول (سم)')}
          {n('age', 'السن')}
        </div>
        <p className="text-[13px] text-ink-3">Mifflin بالوزن الحالي: <span className="num">{mifflin(lastKg, form.heightCm, form.age)}</span> سعر/يوم (حركة قليلة)</p>
      </Group>

      <button className="press mb-6 w-full rounded-2xl bg-blue text-white py-3 font-semibold" onClick={save}>حفظ</button>

      <Group title="باك أب (Google Drive)">
        <p className="text-[13px] text-ink-2">{age === null ? 'لسه معملتش باك أب' : age === 0 ? 'آخر باك أب: النهارده' : `آخر باك أب: من ${age} يوم`} · المفتاح مش بيتحفظ في الملف</p>
        <div className="flex gap-2">
          <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-fill py-3" onClick={doBackup}><CloudUpload size={18} /> باك أب</button>
          <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-fill py-3" onClick={() => file.current?.click()}><Download size={18} /> استرجاع</button>
        </div>
        <input ref={file} type="file" accept="application/json,text/plain,.json,.txt" hidden onChange={(e) => { doRestore(e.target.files?.[0]); e.target.value = '' }} />
      </Group>

      <Group title={`ذاكرة الكوتش (${notes.length}/30)`}>
        {!notes.length && <p className="text-[13px] text-ink-3">الكوتش بيكتب هنا حاجات يفتكرها عنك.</p>}
        {notes.map((x) => (
          <div key={x.id} className="flex items-start gap-2 text-[14px]">
            <span className="flex-1">{x.text}</span>
            <button className="press text-ink-3" onClick={() => db.notes.delete(x.id!)} aria-label="امسح الملاحظة"><X size={16} /></button>
          </div>
        ))}
      </Group>
      <p className="pb-2 text-center text-[12px] text-ink-3">
        Mini's Coach <span className="num">v{__APP_VERSION__}</span> · {new Date(__BUILD_TIME__).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
      </p>
    </Sheet>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold tracking-wide text-ink-2">{title}</h3>
      {children}
    </section>
  )
}
