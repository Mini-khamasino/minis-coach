import { refName } from '../lib/library.ts'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Copy, Trash2, Edit3, Play, ChevronUp, ChevronDown, Clock, X, Calendar } from 'lucide-react'
import { db, type Routine, type RoutineExercise } from '../lib/db.ts'
import { PROGRAMS } from '../lib/exercises.ts'
import { templateFromProgram } from '../lib/routines.ts'
import { ExerciseLibrary } from './ExerciseLibrary.tsx'
import type { LibraryExercise, Activity } from '../lib/library.ts'
import { L } from '../lib/i18n.ts'
import { Sheet, Seg, toast, tick } from './ui.tsx'

const DAYS_NAMES_AR = ['حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت']
const DAYS_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function RoutinesSheet({
  onClose,
  onStartRoutine,
}: {
  onClose: () => void
  onStartRoutine: (routine: Routine) => void
}) {
  const routines = useLiveQuery(() => db.routines.toArray()) ?? []
  const [editingRoutine, setEditingRoutine] = useState<Routine | 'new' | null>(null)
  const [templatePicker, setTemplatePicker] = useState(false)

  const duplicate = async (r: Routine) => {
    tick()
    const copy: Routine = {
      ...r,
      id: `rot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${r.name} (${L('نسخة', 'copy')})`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.routines.add(copy)
    toast(L('✅ اتنسخ الروتين', '✅ Routine duplicated'))
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(L(`متأكد من مسح روتين "${name}"؟`, `Delete routine "${name}"?`))) return
    tick()
    await db.routines.delete(id)
    toast(L('🗑️ اتمسح الروتين', '🗑️ Routine deleted'))
  }

  const copyProgramTemplates = async (progId: string) => {
    const prog = PROGRAMS.find((p) => p.id === progId)
    if (!prog) return
    const copies = templateFromProgram(prog)
    for (const c of copies) {
      await db.routines.add(c)
    }
    toast(L(`✅ تم نسخ ${copies.length} روتينات من ${L(prog.ar, prog.en)}`, `✅ Copied ${copies.length} routines from ${prog.en}`))
    setTemplatePicker(false)
  }

  return (
    <Sheet title={L('روتيناتي', 'My Routines')} onClose={onClose}>
      <div className="flex flex-col gap-3 pb-8">
        <div className="flex gap-2">
          <button
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent py-2.5 font-semibold text-white text-[14px]"
            onClick={() => setEditingRoutine('new')}
          >
            <Plus size={18} /> {L('روتين جديد', 'New routine')}
          </button>
          <button
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-fill py-2.5 font-medium text-accent border border-hair text-[14px]"
            onClick={() => setTemplatePicker(true)}
          >
            <Copy size={16} /> {L('نسخ قالب جاهز', 'Copy template')}
          </button>
        </div>

        {routines.length === 0 ? (
          <div className="card my-4 flex flex-col items-center gap-2 p-6 text-center text-ink-2">
            <span className="text-[36px]">📋</span>
            <p className="font-semibold text-ink text-[16px]">{L('لسه معندكش روتينات خاصة', 'No custom routines yet')}</p>
            <p className="text-[13px] leading-relaxed max-w-[320px]">
              {L('اعمل باقة تمارين خاصة بيك بالأيام والمواعيد، أو انسخ من البرامج الجاهزة وعدلها براحتك.', 'Build custom workout routines with your own schedule, or copy a built-in program.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-1">
            {routines.map((r) => {
              const scheduleLabel =
                r.schedule.mode === 'rotation'
                  ? L('تدوير بالتسلسل', 'Rotation')
                  : r.schedule.days.length === 0
                  ? L('بدون موعد محدد', 'Unscheduled')
                  : r.schedule.days
                      .slice()
                      .sort((a, b) => a - b)
                      .map((d) => L(DAYS_NAMES_AR[d], DAYS_NAMES_EN[d]))
                      .join('، ') + (r.schedule.time ? ` · ${r.schedule.time}` : '')

              return (
                <div key={r.id} className="card flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[17px] font-bold leading-snug">{r.name}</h3>
                      <p className="text-[12px] text-ink-2 mt-0.5 flex items-center gap-1">
                        <Calendar size={13} className="text-accent shrink-0" />
                        <span>{scheduleLabel}</span>
                        <span>·</span>
                        <span>{r.exercises.length} {L('تمرين', 'exercises')}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="press p-2 text-ink-3 rounded-full hover:bg-fill"
                        onClick={() => setEditingRoutine(r)}
                        aria-label={L('تعديل', 'Edit')}
                      >
                        <Edit3 size={17} />
                      </button>
                      <button
                        className="press p-2 text-ink-3 rounded-full hover:bg-fill"
                        onClick={() => duplicate(r)}
                        aria-label={L('نسخ', 'Duplicate')}
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        className="press p-2 text-red/70 rounded-full hover:bg-red/10"
                        onClick={() => remove(r.id, r.name)}
                        aria-label={L('حذف', 'Delete')}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {r.exercises.slice(0, 5).map((ex, i) => (
                      <span key={i} className="rounded-lg bg-fill px-2 py-0.5 text-[11px] text-ink-2 truncate max-w-[130px]">
                        {refName(ex.ref)}
                      </span>
                    ))}
                    {r.exercises.length > 5 && (
                      <span className="rounded-lg bg-fill px-2 py-0.5 text-[11px] text-ink-3">
                        +{r.exercises.length - 5}
                      </span>
                    )}
                  </div>

                  <button
                    className="press mt-1 flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-white text-[14px]"
                    onClick={() => {
                      onStartRoutine(r)
                      onClose()
                    }}
                  >
                    <Play size={16} fill="currentColor" /> {L('ابدأ التمرين ده دلوقتي', 'Start workout now')}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Template Picker Sheet */}
        {templatePicker && (
          <Sheet title={L('نسخ من البرامج الجاهزة', 'Copy Built-in Program')} onClose={() => setTemplatePicker(false)}>
            <div className="flex flex-col gap-3 pb-6">
              <p className="text-[13px] text-ink-2 px-1">
                {L('اختر برنامج عشان يتحول لروتينات خاصة بيك تقدر تعدل في تمارينها وأوزانها:', 'Pick a program to copy its days into custom editable routines:')}
              </p>
              {PROGRAMS.map((prog) => (
                <button
                  key={prog.id}
                  className="press card flex flex-col gap-1 p-3.5 text-start"
                  onClick={() => copyProgramTemplates(prog.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[16px]">{L(prog.ar, prog.en)}</span>
                    <span className="text-[12px] text-accent font-medium">{prog.days.length} {L('أيام', 'days')}</span>
                  </div>
                  <p className="text-[12px] text-ink-2">
                    {prog.days.map((d) => L(d.ar, d.en)).join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          </Sheet>
        )}

        {/* Routine Editor */}
        {editingRoutine && (
          <RoutineEditorSheet
            initial={editingRoutine === 'new' ? null : editingRoutine}
            onClose={() => setEditingRoutine(null)}
          />
        )}
      </div>
    </Sheet>
  )
}

function RoutineEditorSheet({
  initial,
  onClose,
}: {
  initial: Routine | null
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [mode, setMode] = useState<'days' | 'rotation'>(initial?.schedule.mode || 'days')
  const [days, setDays] = useState<number[]>(initial?.schedule.days || [0, 2, 4])
  const [time, setTime] = useState<string>(initial?.schedule.time || '18:00')
  const [exercises, setExercises] = useState<RoutineExercise[]>(initial?.exercises || [])
  const [libraryOpen, setLibraryOpen] = useState(false)

  const toggleDay = (d: number) => {
    tick()
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
  }

  const addExercise = (item: LibraryExercise | Activity) => {
    tick()
    const isActivity = 'met' in item
    const newEx: RoutineExercise = {
      ref: {
        kind: isActivity ? 'activity' : 'lib',
        id: item.id,
      },
      type: isActivity ? 'time' : 'reps',
      sets: 3,
      reps: 10,
      kg: 0,
      seconds: isActivity ? 1800 : undefined, // 30 min default for activities
      restSec: 90,
    }
    setExercises((prev) => [...prev, newEx])
  }

  const updateExercise = (index: number, patch: Partial<RoutineExercise>) => {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)))
  }

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index))
  }

  const moveExercise = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= exercises.length) return
    const updated = [...exercises]
    const temp = updated[index]
    updated[index] = updated[target]
    updated[target] = temp
    setExercises(updated)
  }

  const save = async () => {
    if (!name.trim()) {
      toast(L('اكتب اسم الروتين الأول', 'Please enter a routine name'))
      return
    }
    if (!exercises.length) {
      toast(L('أضف تمرين واحد على الأقل', 'Add at least one exercise'))
      return
    }

    const now = Date.now()
    const routine: Routine = {
      id: initial?.id || `rot_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      schedule: {
        mode,
        days: mode === 'days' ? days : [],
        time: mode === 'days' && time ? time : undefined,
      },
      exercises,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    }

    await db.routines.put(routine)
    toast(L('✅ اتحفظ الروتين', '✅ Routine saved'))
    onClose()
  }

  return (
    <Sheet title={initial ? L('تعديل الروتين', 'Edit Routine') : L('روتين جديد', 'New Routine')} onClose={onClose}>
      <div className="flex flex-col gap-4 pb-8">
        <label className="block">
          <span className="label">{L('اسم الروتين', 'Routine name')}</span>
          <input
            className="field mt-1 font-semibold"
            placeholder={L('مثلاً: بوش، أرجل، كارديو سباحة…', 'e.g. Push, Legs, Swimming cardio…')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {/* Schedule */}
        <div className="flex flex-col gap-2">
          <span className="label">{L('الجدول والمواعيد', 'Schedule')}</span>
          <Seg
            value={mode}
            onChange={(m) => setMode(m as 'days' | 'rotation')}
            options={[
              ['days', L('أيام وموعد محدد', 'Specific days')],
              ['rotation', L('تدوير بالتسلسل', 'Rotation')],
            ]}
          />

          {mode === 'days' && (
            <div className="flex flex-col gap-2.5 rounded-2xl bg-fill p-3 border border-hair mt-1">
              <span className="text-[12px] text-ink-2">{L('أيام التمرين في الأسبوع:', 'Workout days:')}</span>
              <div className="flex justify-between gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`press size-10 rounded-full font-bold text-[13px] border ${
                      days.includes(d) ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-2 border-hair'
                    }`}
                    onClick={() => toggleDay(d)}
                  >
                    {L(DAYS_NAMES_AR[d][0], DAYS_NAMES_EN[d].slice(0, 2))}
                  </button>
                ))}
              </div>

              <label className="flex items-center justify-between gap-2 pt-2 border-t border-hair">
                <span className="text-[13px] text-ink flex items-center gap-1.5">
                  <Clock size={16} className="text-accent" /> {L('وقت التنبيه / التمرين:', 'Session time:')}
                </span>
                <input
                  type="time"
                  className="rounded-xl bg-surface px-2.5 py-1 text-[14px] font-semibold text-ink border border-hair"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {/* Exercises list */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label">{L(`التمارين (${exercises.length})`, `Exercises (${exercises.length})`)}</span>
            <button
              type="button"
              className="press flex items-center gap-1 text-[13px] text-accent font-semibold"
              onClick={() => setLibraryOpen(true)}
            >
              <Plus size={16} /> {L('إضافة تمرين', 'Add exercise')}
            </button>
          </div>

          {exercises.length === 0 ? (
            <button
              type="button"
              className="press rounded-2xl border-2 border-dashed border-hair p-6 text-center text-ink-3 hover:text-accent"
              onClick={() => setLibraryOpen(true)}
            >
              + {L('اضغط هنا لإضافة تمارين من المكتبة', 'Tap to add exercises from library')}
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {exercises.map((ex, i) => (
                <div key={i} className="card flex flex-col gap-2 p-3 bg-fill border border-hair">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="num text-[12px] font-bold text-ink-3">#{i + 1}</span>
                      <p className="font-semibold text-[14px] truncate">{refName(ex.ref)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        className="press p-1 text-ink-3 disabled:opacity-20"
                        onClick={() => moveExercise(i, -1)}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={i === exercises.length - 1}
                        className="press p-1 text-ink-3 disabled:opacity-20"
                        onClick={() => moveExercise(i, 1)}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="press p-1 text-red/70 hover:text-red"
                        onClick={() => removeExercise(i)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Type and values */}
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-xl bg-surface px-2 py-1 text-[12px] text-ink border border-hair"
                      value={ex.type}
                      onChange={(e) => updateExercise(i, { type: e.target.value as 'reps' | 'time' | 'distance' })}
                    >
                      <option value="reps">{L('عدات ووزن', 'Reps & kg')}</option>
                      <option value="time">{L('وقت وثواني', 'Time (sec)')}</option>
                      <option value="distance">{L('مسافة', 'Distance')}</option>
                    </select>

                    {ex.type === 'reps' && (
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <input
                          type="number"
                          className="field num !w-14 !py-1 text-center text-[13px]"
                          placeholder={L('سيت', 'sets')}
                          value={ex.sets || ''}
                          onChange={(e) => updateExercise(i, { sets: Number(e.target.value) || 0 })}
                        />
                        <span className="text-ink-3">×</span>
                        <input
                          type="number"
                          className="field num !w-14 !py-1 text-center text-[13px]"
                          placeholder={L('عدة', 'reps')}
                          value={ex.reps || ''}
                          onChange={(e) => updateExercise(i, { reps: Number(e.target.value) || 0 })}
                        />
                        <span className="text-ink-3">@</span>
                        <input
                          type="number"
                          className="field num !w-16 !py-1 text-center text-[13px]"
                          placeholder={L('كجم', 'kg')}
                          value={ex.kg || ''}
                          onChange={(e) => updateExercise(i, { kg: Number(e.target.value) || 0 })}
                        />
                      </div>
                    )}

                    {ex.type === 'time' && (
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <input
                          type="number"
                          className="field num !w-14 !py-1 text-center text-[13px]"
                          placeholder={L('سيت', 'sets')}
                          value={ex.sets || ''}
                          onChange={(e) => updateExercise(i, { sets: Number(e.target.value) || 0 })}
                        />
                        <span className="text-ink-3">×</span>
                        <input
                          type="number"
                          className="field num !w-20 !py-1 text-center text-[13px]"
                          placeholder={L('ثواني', 'sec')}
                          value={ex.seconds || ''}
                          onChange={(e) => updateExercise(i, { seconds: Number(e.target.value) || 0 })}
                        />
                        <span className="text-ink-3">{L('ث', 's')}</span>
                      </div>
                    )}

                    {ex.type === 'distance' && (
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <input
                          type="number"
                          className="field num !w-20 !py-1 text-center text-[13px]"
                          placeholder={L('أمتار', 'meters')}
                          value={ex.meters || ''}
                          onChange={(e) => updateExercise(i, { meters: Number(e.target.value) || 0 })}
                        />
                        <span className="text-ink-3">{L('متر', 'm')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="press mt-4 w-full rounded-2xl bg-accent py-3.5 font-semibold text-white"
          onClick={save}
        >
          {L('حفظ الروتين', 'Save Routine')}
        </button>

        {libraryOpen && (
          <ExerciseLibrary
            onClose={() => setLibraryOpen(false)}
            onAddToRoutine={(item) => {
              addExercise(item)
              toast(L('✅ أضيف للروتين', '✅ Added to routine'))
            }}
          />
        )}
      </div>
    </Sheet>
  )
}
