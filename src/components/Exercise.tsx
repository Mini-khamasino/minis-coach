import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Model, { type IExerciseData, type Muscle } from 'react-body-highlighter'
import { Check, Plus, RotateCcw, Timer, Trophy, X, Info } from 'lucide-react'
import { db, today, type Settings, type Workout } from '../lib/db.ts'
import { EXERCISES, PROGRAMS, exName, muscleName, suggestProgram, workoutKcal, e1rm, type Program } from '../lib/exercises.ts'
import { nextDayIndex, recovering, weeklySets, personalRecords, lastSets } from '../lib/training.ts'
import { L } from '../lib/i18n.ts'
import { Sheet, Seg, toast, tick } from './ui.tsx'
import { ProgramPicker } from './ProgramPicker.tsx'

const repsMin = (r: string) => parseInt(r) || 8

export function Exercise({ s }: { s: Settings }) {
  const workouts = useLiveQuery(() => db.workouts.toArray().then((ws) => ws.sort((a, b) => a.startedAt - b.startedAt))) ?? []
  const program = PROGRAMS.find((p) => p.id === s.programId) ?? suggestProgram(s.trainDays, s.place)
  const active = workouts.find((w) => !w.endedAt)
  const dayIdx = nextDayIndex(workouts, program)
  const day = program.days[dayIdx]
  const now = Date.now()
  const doneToday = workouts.some((w) => w.endedAt && w.date === today())
  const [sheet, setSheet] = useState<'program' | 'log' | null>(null)
  const [muscle, setMuscle] = useState<Muscle | null>(null)

  const targets = useMemo(() => [...new Set(day.slots.flatMap(([id]) => EXERCISES[id]?.muscles.slice(0, 2) ?? []))], [day])
  const rec = recovering(workouts, now)
  const week = weeklySets(workouts, now)
  const prs = [...personalRecords(workouts)].sort((a, b) => b[1].date.localeCompare(a[1].date)).slice(0, 5)
  const sessionsThisWeek = new Set(workouts.filter((w) => w.endedAt && now - w.startedAt < 7 * 86400_000).map((w) => w.date)).size

  const start = async () => {
    if (active) return setSheet('log')
    await db.workouts.add({
      date: today(), startedAt: Date.now(), programId: program.id, dayIndex: dayIdx,
      exercises: day.slots.map(([exId, sets, reps]) => {
        const last = lastSets(workouts, exId)
        return { exId, sets: Array.from({ length: sets }, (_, i) => ({ kg: last[i]?.kg ?? last[0]?.kg ?? 0, reps: last[i]?.reps ?? repsMin(reps), done: false })) }
      }),
    })
    setSheet('log')
  }

  return (
    <div className="flex flex-col gap-3">
      <BodyCard targets={doneToday ? [] : targets} recovering={rec} week={week} onMuscle={setMuscle} />

      <section className="card">
        <div className="mb-1 flex items-center justify-between">
          <p className="label">{doneToday ? L('خلصت تمرين النهارده 💪', 'Done for today 💪') : L('التمرين الجاي', 'Next workout')}</p>
          <button className="press text-[13px] text-accent" onClick={() => setSheet('program')}>{L(program.ar, program.en)} ▾</button>
        </div>
        <h2 className="mb-3 text-[22px] leading-tight font-bold tracking-tight">{L(day.ar, day.en)}</h2>
        <ul className="mb-4">
          {day.slots.map(([id, sets, reps]) => (
            <li key={id} className="flex justify-between border-b border-hair py-2 text-[15px] last:border-0">
              <span>{exName(id)}</span><span className="num text-ink-2">{sets}×{reps}</span>
            </li>
          ))}
        </ul>
        <button className="press w-full rounded-2xl bg-accent py-3.5 text-[17px] font-semibold text-white" onClick={start}>
          {active ? L('كمّل التمرين', 'Resume workout') : doneToday ? L('تمرين زيادة', 'Extra session') : L('ابدأ التمرين', 'Start workout')}
        </button>
        <p className="mt-2 text-center text-[12px] text-ink-3">{L(`الأسبوع ده: ${sessionsThisWeek} من ${s.trainDays} تمرين`, `This week: ${sessionsThisWeek} of ${s.trainDays} sessions`)}</p>
      </section>

      {prs.length > 0 && (
        <section className="card">
          <p className="label mb-2 flex items-center gap-1.5"><Trophy size={15} className="text-amber" /> {L('أرقامك القياسية', 'Personal records')}</p>
          {prs.map(([id, pr]) => (
            <div key={id} className="flex justify-between border-b border-hair py-2 text-[15px] last:border-0">
              <span>{exName(id)}</span><span className="num">{pr.kg}×{pr.reps} <span className="text-[12px] text-ink-3">~{Math.round(pr.e1rm)} 1RM</span></span>
            </div>
          ))}
        </section>
      )}

      {sheet === 'program' && <ProgramSheet s={s} current={program} onClose={() => setSheet(null)} />}
      {sheet === 'log' && active && <Logger w={active} all={workouts} onClose={() => setSheet(null)} restSec={s.restSec} />}
      {muscle && <MuscleSheet muscle={muscle} place={s.place} onClose={() => setMuscle(null)} />}
    </div>
  )
}

function BodyCard({ targets, recovering: rec, week, onMuscle }: { targets: Muscle[]; recovering: Muscle[]; week: Map<Muscle, number>; onMuscle: (m: Muscle) => void }) {
  const [mode, setMode] = useState<'today' | 'week'>('today')
  const [side, setSide] = useState<'anterior' | 'posterior'>('anterior')
  // read theme colors only when the theme or accent actually changes (getComputedStyle forces a full style recalc)
  const { theme, accent: accentName } = document.documentElement.dataset
  const { accent, amber, body } = useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    return {
      accent: css.getPropertyValue('--color-accent').trim() || '#0a84ff',
      amber: css.getPropertyValue('--color-amber').trim() || '#ff9f0a',
      body: theme === 'light' ? '#d1d1d6' : '#3a3a3f',
    }
  }, [theme, accentName])
  const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, ${body})`

  // frequency picks the color: today → 1 recovering, 2+ target; week → set-volume buckets
  const data: IExerciseData[] = mode === 'today'
    ? [{ name: 'rec', muscles: rec.filter((m) => !targets.includes(m)), frequency: 1 }, { name: 'target', muscles: targets, frequency: 2 }]
    : [...week].map(([m, n]) => ({ name: m, muscles: [m], frequency: n >= 10 ? 3 : n >= 4 ? 2 : 1 }))
  const colors = mode === 'today' ? [mix(amber, 55), accent, accent] : [mix(accent, 35), mix(accent, 65), accent]
  const neglected = mode === 'week' ? (['chest', 'upper-back', 'quadriceps', 'hamstring', 'front-deltoids', 'gluteal'] as Muscle[]).filter((m) => !week.get(m)) : []

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1"><Seg value={mode} onChange={setMode} options={[['today', L('النهارده', 'Today')], ['week', L('الأسبوع', 'This week')]]} /></div>
        <button className="press grid size-10 place-items-center rounded-xl bg-fill text-ink-2" onClick={() => setSide(side === 'anterior' ? 'posterior' : 'anterior')} aria-label={L('لف الجسم', 'Flip body')}><RotateCcw size={18} /></button>
      </div>
      <div className="mx-auto w-[62%] max-w-[230px]" key={side}>
        <Model type={side} data={data} highlightedColors={colors} bodyColor={body} onClick={(m) => 'muscle' in m && onMuscle(m.muscle)} style={{ width: '100%' }} svgStyle={{ cursor: 'pointer' }} />
      </div>
      <p className="mt-2 text-center text-[12px] text-ink-2">
        {mode === 'today'
          ? <><Dot c={accent} /> {L('عضلات النهارده', "Today's muscles")} <Dot c={mix(amber, 55)} /> {L('لسه بتريّح', 'Recovering')} · {side === 'anterior' ? L('قدام', 'Front') : L('ضهر', 'Back')}</>
          : <><Dot c={mix(accent, 35)} />1–3 <Dot c={mix(accent, 65)} />4–9 <Dot c={accent} />10+ {L('سيت', 'sets')}</>}
      </p>
      {neglected.length > 0 && <p className="mt-1 text-center text-[12px] text-amber">{L('ملمستهاش الأسبوع ده: ', 'Not trained this week: ')}{neglected.map(muscleName).join('، ')}</p>}
      <p className="mt-1 text-center text-[11px] text-ink-3">{L('دوس على عضلة تشوف تمارينها', 'Tap a muscle for its exercises')}</p>
    </section>
  )
}

const Dot = ({ c }: { c: string }) => <span className="mx-1 inline-block size-2.5 rounded-full align-middle" style={{ background: c }} />

function MuscleSheet({ muscle, place, onClose }: { muscle: Muscle; place: 'gym' | 'home'; onClose: () => void }) {
  const list = Object.values(EXERCISES).filter((e) => e.muscles.includes(muscle) && (e.place === 'both' || e.place === place))
  return (
    <Sheet title={muscleName(muscle)} onClose={onClose}>
      {list.map((e) => (
        <div key={e.id} className="border-b border-hair py-3 last:border-0">
          <p className="font-medium">{L(e.ar, e.en)} {e.muscles[0] === muscle && <span className="text-[12px] text-accent">● {L('أساسي', 'primary')}</span>}</p>
          <p className="text-[13px] text-ink-2">{L(e.tipAr, e.tipEn)}</p>
        </div>
      ))}
    </Sheet>
  )
}

function ProgramSheet({ s, onClose }: { s: Settings; current: Program; onClose: () => void }) {
  return <Sheet title={L('البرنامج', 'Program')} onClose={onClose}><ProgramPicker s={s} onPicked={onClose} /></Sheet>
}

function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = 880; g.gain.value = 0.15
    o.connect(g).connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.25)
  } catch { /* audio blocked */ }
}

/** Live workout: sets autosave on every tap, so closing the app never loses progress. */
function Logger({ w, all, restSec, onClose }: { w: Workout; all: Workout[]; restSec: number; onClose: () => void }) {
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [, force] = useState(0)
  const [adding, setAdding] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const bodyKg = useLiveQuery(() => db.weights.orderBy('date').last())?.kg ?? 75

  useEffect(() => {
    if (!restEnd) return
    const t = setInterval(() => {
      if (Date.now() >= restEnd) { beep(); tick(); setRestEnd(null) } else force((n) => n + 1)
    }, 250)
    return () => clearInterval(t)
  }, [restEnd])

  const save = (exercises: Workout['exercises']) => db.workouts.update(w.id!, { exercises })
  const setSet = (ei: number, si: number, patch: Partial<Workout['exercises'][number]['sets'][number]>) =>
    save(w.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, ...patch } : x)) })))
  const toggle = (ei: number, si: number) => {
    const done = !w.exercises[ei].sets[si].done
    setSet(ei, si, { done })
    if (done) { tick(); setRestEnd(Date.now() + restSec * 1000 * (EXERCISES[w.exercises[ei].exId]?.compound ? 1.3 : 1)) }
  }

  const prsBefore = personalRecords(all.filter((x) => x.id !== w.id))
  const finish = async () => {
    const minutes = Math.max(1, Math.round((Date.now() - w.startedAt) / 60000))
    const sets = w.exercises.flatMap((e) => e.sets.filter((s) => s.done).map((s) => ({ ...s, exId: e.exId })))
    if (!sets.length && !confirm(L('مفيش ولا سيت متعلم. تلغي التمرين؟', 'No sets ticked. Discard the workout?'))) return
    if (!sets.length) { await db.workouts.delete(w.id!); return onClose() }
    await db.workouts.update(w.id!, { endedAt: Date.now() })
    const volume = Math.round(sets.reduce((a, s) => a + s.kg * s.reps, 0))
    const newPrs = sets.filter((s) => s.kg > 0 && e1rm(s.kg, s.reps) > (prsBefore.get(s.exId)?.e1rm ?? Infinity) && prsBefore.has(s.exId))
    toast(L(`💪 ${sets.length} سيت · ${volume} كجم حجم · ~${workoutKcal(minutes, bodyKg)} سعر${newPrs.length ? ` · 🏆 ${newPrs.length} رقم قياسي` : ''}`,
      `💪 ${sets.length} sets · ${volume} kg volume · ~${workoutKcal(minutes, bodyKg)} kcal${newPrs.length ? ` · 🏆 ${newPrs.length} PR` : ''}`))
    onClose()
  }

  const left = restEnd ? Math.max(0, Math.ceil((restEnd - Date.now()) / 1000)) : 0
  return (
    <Sheet title={L('التمرين', 'Workout')} onClose={onClose}>
      {w.exercises.map((e, ei) => {
        const last = lastSets(all.filter((x) => x.id !== w.id), e.exId)
        return (
          <section key={ei} className="mb-4 rounded-2xl bg-fill p-3">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="flex-1 font-semibold">{exName(e.exId)}</h3>
              <button className="press p-1 text-ink-3" onClick={() => setTip(tip === e.exId ? null : e.exId)} aria-label={L('نصيحة', 'Tip')}><Info size={17} /></button>
              <button className="press p-1 text-ink-3" onClick={() => save(w.exercises.filter((_, i) => i !== ei))} aria-label={L('شيل التمرين', 'Remove exercise')}><X size={17} /></button>
            </div>
            {tip === e.exId && <p className="mb-2 text-[13px] text-ink-2">💡 {L(EXERCISES[e.exId]?.tipAr ?? '', EXERCISES[e.exId]?.tipEn ?? '')}</p>}
            <div className="mb-1 grid grid-cols-[28px_1fr_1fr_44px] gap-2 text-center text-[11px] text-ink-3">
              <span>#</span><span>{L('كجم', 'kg')}</span><span>{L('عدات', 'reps')}</span><span />
            </div>
            {e.sets.map((st, si) => (
              <div key={si} className={`mb-1.5 grid grid-cols-[28px_1fr_1fr_44px] items-center gap-2 ${st.done ? 'opacity-60' : ''}`}>
                <span className="num text-center text-ink-2">{si + 1}</span>
                <input className="field num !py-2 text-center" inputMode="decimal" value={st.kg || ''} placeholder={last[si] ? String(last[si].kg) : '0'}
                  onChange={(ev) => setSet(ei, si, { kg: Number(ev.target.value) || 0 })} aria-label={L('كجم', 'kg')} />
                <input className="field num !py-2 text-center" inputMode="numeric" value={st.reps || ''} placeholder={last[si] ? String(last[si].reps) : ''}
                  onChange={(ev) => setSet(ei, si, { reps: Number(ev.target.value) || 0 })} aria-label={L('عدات', 'reps')} />
                <button className={`press grid h-10 place-items-center rounded-xl ${st.done ? 'bg-green text-white' : 'bg-canvas/40 text-ink-3'}`} onClick={() => toggle(ei, si)} aria-pressed={st.done} aria-label={L('خلصت السيت', 'Set done')}>
                  <Check size={20} strokeWidth={3} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button className="press text-[13px] text-accent" onClick={() => save(w.exercises.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, { ...(x.sets.at(-1) ?? { kg: 0, reps: 8 }), done: false }] } : x)))}>+ {L('سيت', 'Set')}</button>
              {last.length > 0 && <span className="text-[12px] text-ink-3">{L('آخر مرة', 'Last time')}: {last.map((x) => `${x.kg}×${x.reps}`).join(' · ')}</span>}
            </div>
          </section>
        )
      })}
      <button className="press mb-4 flex w-full items-center justify-center gap-1 rounded-2xl bg-fill py-3 text-accent" onClick={() => setAdding(true)}><Plus size={18} /> {L('تمرين', 'Exercise')}</button>
      <button className="press mb-2 w-full rounded-2xl bg-accent py-3.5 text-[17px] font-semibold text-white" onClick={finish}>{L('خلصت التمرين', 'Finish workout')}</button>

      {restEnd && (
        <div className="glass pop-enter sticky bottom-2 mt-2 flex items-center gap-3 rounded-2xl p-3" role="timer" aria-live="polite">
          <Timer className="text-accent" size={22} />
          <span className="num flex-1 text-[28px]">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
          <button className="press rounded-xl bg-fill px-3 py-2 text-[14px]" onClick={() => setRestEnd(restEnd + 15000)}>+15</button>
          <button className="press rounded-xl bg-fill px-3 py-2 text-[14px]" onClick={() => setRestEnd(null)}>{L('تخطي', 'Skip')}</button>
        </div>
      )}
      {adding && <AddExercise onPick={(exId) => save([...w.exercises, { exId, sets: [{ kg: 0, reps: 10, done: false }, { kg: 0, reps: 10, done: false }, { kg: 0, reps: 10, done: false }] }])} onClose={() => setAdding(false)} />}
    </Sheet>
  )
}

function AddExercise({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const list = Object.values(EXERCISES).filter((e) => !q || `${e.ar} ${e.en} ${e.muscles.map(muscleName).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Sheet title={L('ضيف تمرين', 'Add exercise')} onClose={onClose}>
      <input className="field mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('اسم التمرين أو العضلة…', 'Exercise or muscle…')} autoFocus />
      {list.map((e) => (
        <button key={e.id} className="press flex w-full justify-between border-b border-hair py-3 text-start" onClick={() => { onPick(e.id); onClose() }}>
          <span>{L(e.ar, e.en)}</span><span className="text-[12px] text-ink-3">{e.muscles.slice(0, 2).map(muscleName).join(' · ')}</span>
        </button>
      ))}
    </Sheet>
  )
}
