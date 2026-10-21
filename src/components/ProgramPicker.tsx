import { saveSettings, type Settings } from '../lib/db.ts'
import { PROGRAMS, suggestProgram } from '../lib/exercises.ts'
import { L } from '../lib/i18n.ts'
import { Seg } from './ui.tsx'

/** Gym/home, days per week, program, rest timer — used by the Train tab and by Profile. */
export function ProgramPicker({ s, onPicked }: { s: Settings; onPicked?: () => void }) {
  const current = PROGRAMS.find((p) => p.id === s.programId) ?? suggestProgram(s.trainDays, s.place)
  const suggested = suggestProgram(s.trainDays, s.place)
  return (
    <>
      <div className="mb-3"><Seg value={s.place} onChange={(place) => saveSettings({ place, programId: '' })} options={[['gym', L('جيم', 'Gym')], ['home', L('البيت', 'Home')]]} /></div>
      <p className="label mb-2">{L('أيام في الأسبوع', 'Days per week')}</p>
      <div className="mb-4"><Seg value={String(s.trainDays)} onChange={(d) => saveSettings({ trainDays: Number(d), programId: '' })} options={[2, 3, 4, 5, 6].map((d) => [String(d), String(d)] as [string, string])} /></div>
      {PROGRAMS.filter((p) => p.place === s.place).map((p) => (
        <button key={p.id} className={`press mb-2 w-full rounded-2xl p-3.5 text-start ${p.id === current.id ? 'bg-accent text-white' : 'bg-fill'}`}
          onClick={() => { saveSettings({ programId: p.id }); onPicked?.() }}>
          <p className="font-semibold">{L(p.ar, p.en)} {p.id === suggested.id && <span className="text-[12px] opacity-80">· {L('مقترح ليك', 'suggested')}</span>}</p>
          <p className={`text-[13px] ${p.id === current.id ? 'text-white/80' : 'text-ink-2'}`}>{p.days.map((d) => L(d.ar, d.en)).join(' → ')}</p>
        </button>
      ))}
      <p className="label mt-3 mb-2">{L('الراحة بين السيتات (ثانية)', 'Rest between sets (seconds)')}</p>
      <Seg value={String(s.restSec)} onChange={(v) => saveSettings({ restSec: Number(v) })} options={[60, 90, 120, 180].map((v) => [String(v), String(v)] as [string, string])} />
    </>
  )
}
