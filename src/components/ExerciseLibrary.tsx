import { useEffect, useMemo, useState } from 'react'
import Model, { type IExerciseData, type Muscle } from 'react-body-highlighter'
import { Search, X, Plus } from 'lucide-react'
import {
  loadLibrary,
  searchLibrary,
  ACTIVITIES,
  type LibraryExercise,
  type Activity,
  type Place,
  type LibraryFilters,
  term,
} from '../lib/library.ts'
import { muscleName } from '../lib/exercises.ts'
import { L } from '../lib/i18n.ts'
import { getSettings } from '../lib/db.ts'
import { Sheet, Seg } from './ui.tsx'
import { ExerciseAnimation } from './ExerciseAnimation.tsx'

interface Props {
  initialMuscle?: Muscle | null
  onClose: () => void
  onAddToRoutine?: (item: LibraryExercise | Activity) => void
}

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

export function ExerciseLibrary({ initialMuscle, onClose, onAddToRoutine }: Props) {
  const [exercises, setExercises] = useState<LibraryExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'exercises' | 'activities'>('exercises')
  const [query, setQuery] = useState('')
  const [selectedEx, setSelectedEx] = useState<LibraryExercise | Activity | null>(null)

  const [place, setPlace] = useState<Place | 'all'>('all')
  const [noEquipment, setNoEquipment] = useState(false)
  useEffect(() => { getSettings().then((s) => setNoEquipment(!!s.noEquipment)) }, [])
  const [equipment, setEquipment] = useState<string>('all')
  const [muscle, setMuscle] = useState<Muscle | 'all'>(initialMuscle ?? 'all')
  const [category, setCategory] = useState<string>('all')
  const [level, setLevel] = useState<string>('all')

  useEffect(() => {
    loadLibrary()
      .then((data) => {
        setExercises(data)
        setLoading(false)
      })
      .catch((e) => {
        console.error('Failed to load exercise library', e)
        setLoading(false)
      })
  }, [])

  const filteredExercises = useMemo(() => {
    const filters: LibraryFilters = {
      place: place !== 'all' ? place : undefined,
      equipment: equipment !== 'all' ? equipment : undefined,
      muscle: muscle !== 'all' ? muscle : undefined,
      category: category !== 'all' ? category : undefined,
      level: level !== 'all' ? level : undefined,
      noEquipment,
    }
    return searchLibrary(query, exercises, filters)
  }, [exercises, query, place, equipment, muscle, category, level, noEquipment])

  const filteredActivities = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ACTIVITIES.filter((act) => {
      if (place !== 'all' && act.place !== place) return false
      if (!q) return true
      return act.ar.toLowerCase().includes(q) || act.en.toLowerCase().includes(q)
    })
  }, [query, place])

  const EQUIPMENTS = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'bands', 'kettlebells', 'exercise ball']
  const CATEGORIES = ['strength', 'stretching', 'plyometrics', 'powerlifting', 'cardio']
  const LEVELS = ['beginner', 'intermediate', 'expert']
  const MUSCLES: Muscle[] = [
    'chest', 'upper-back', 'lower-back', 'front-deltoids', 'back-deltoids',
    'biceps', 'triceps', 'forearm', 'quadriceps', 'hamstring', 'gluteal',
    'calves', 'abs', 'obliques', 'trapezius'
  ]

  const activeFilterCount = (place !== 'all' ? 1 : 0) + (noEquipment ? 1 : 0) + (equipment !== 'all' ? 1 : 0) + (muscle !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0) + (level !== 'all' ? 1 : 0)

  return (
    <Sheet title={L('مكتبة التمارين', 'Exercise Library')} onClose={onClose}>
      <div className="flex flex-col gap-3 pb-8">
        <Seg
          value={tab}
          onChange={(t) => setTab(t as 'exercises' | 'activities')}
          options={[
            ['exercises', L(`تمارين (${exercises.length || '…'})`, `Gym & Home (${exercises.length || '…'})`)],
            ['activities', L(`أنشطة ورياضات (${ACTIVITIES.length})`, `Sports & Cardio (${ACTIVITIES.length})`)],
          ]}
        />

        {/* Search Input */}
        <div className="relative">
          <input
            className="field ps-10 pe-9"
            placeholder={tab === 'exercises' ? L('ابحث بالاسم عربي أو إنجليزي…', 'Search exercise name…') : L('ابحث عن رياضة، جري، عجل…', 'Search sport or activity…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search size={18} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
          {query && (
            <button className="press absolute end-3 top-1/2 -translate-y-1/2 text-ink-3" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2">
          {/* Place chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[13px] no-scrollbar">
            {(['all', 'gym', 'home', 'outside'] as const).map((p) => (
              <button
                key={p}
                className={`press shrink-0 rounded-full px-3 py-1.5 font-medium border ${
                  place === p ? 'bg-accent text-white border-accent' : 'bg-fill text-ink-2 border-hair'
                }`}
                onClick={() => setPlace(p)}
              >
                {p === 'all' ? L('كل الأماكن', 'All places') : p === 'gym' ? L('🏋️ جيم', '🏋️ Gym') : p === 'home' ? L('🏠 بيت', '🏠 Home') : L('🌳 بره', '🌳 Outside')}
              </button>
            ))}
            {tab === 'exercises' && (
              <button className={`press shrink-0 rounded-full px-3 py-1.5 font-medium border ${noEquipment ? 'bg-accent text-white border-accent' : 'bg-fill text-ink-2 border-hair'}`}
                aria-pressed={noEquipment} onClick={() => setNoEquipment(!noEquipment)}>
                🙌 {L('معنديش أدوات', "I don't have equipment")}
              </button>
            )}
          </div>

          {tab === 'exercises' && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-[12px] no-scrollbar">
              {/* Muscle filter */}
              <select
                className="rounded-full bg-fill border border-hair px-2.5 py-1 text-ink-2"
                value={muscle}
                onChange={(e) => setMuscle(e.target.value as Muscle | 'all')}
              >
                <option value="all">{L('💪 كل العضلات', '💪 All muscles')}</option>
                {MUSCLES.map((m) => (
                  <option key={m} value={m}>{muscleName(m)}</option>
                ))}
              </select>

              {/* Equipment filter */}
              <select
                className="rounded-full bg-fill border border-hair px-2.5 py-1 text-ink-2"
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
              >
                <option value="all">{L('🔧 كل الأدوات', '🔧 All equipment')}</option>
                {EQUIPMENTS.map((eq) => (
                  <option key={eq} value={eq}>{term(eq)}</option>
                ))}
              </select>

              {/* Category filter */}
              <select
                className="rounded-full bg-fill border border-hair px-2.5 py-1 text-ink-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">{L('🏷️ كل الفئات', '🏷️ All categories')}</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{term(cat)}</option>
                ))}
              </select>

              {/* Level filter */}
              <select
                className="rounded-full bg-fill border border-hair px-2.5 py-1 text-ink-2"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="all">{L('⚡ كل المستويات', '⚡ All levels')}</option>
                {LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{term(lvl)}</option>
                ))}
              </select>

              {activeFilterCount > 0 && (
                <button
                  className="press shrink-0 rounded-full bg-red/15 text-red px-2.5 py-1 text-[12px]"
                  onClick={() => { setPlace('all'); setNoEquipment(false); setEquipment('all'); setMuscle('all'); setCategory('all'); setLevel('all') }}
                >
                  {L('مسح الفلاتر', 'Clear')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results count */}
        <p className="text-[12px] text-ink-3 px-1">
          {tab === 'exercises'
            ? L(`${filteredExercises.length} تمرين متاح`, `${filteredExercises.length} exercises found`)
            : L(`${filteredActivities.length} نشاط`, `${filteredActivities.length} activities found`)}
        </p>

        {/* List */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="card h-18 animate-pulse" />)}
          </div>
        ) : tab === 'exercises' ? (
          <div className="flex flex-col gap-2">
            {filteredExercises.slice(0, 80).map((ex) => (
              <button
                key={ex.id}
                className="press card flex items-center gap-3 p-2.5 text-start"
                onClick={() => setSelectedEx(ex)}
              >
                <div className="size-14 overflow-hidden rounded-xl bg-fill shrink-0 border border-hair">
                  {ex.images[0] ? (
                    <img
                      src={`${CDN_BASE}${ex.images[0]}`}
                      alt={ex.name}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-ink-3">🏋️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] leading-snug truncate" dir="ltr">{ex.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-ink-3">
                    <span>{term(ex.category)}</span>
                    <span>·</span>
                    <span>{ex.equipment ? term(ex.equipment) : L('وزن الجسم', 'Bodyweight')}</span>
                    {ex.primaryMuscles[0] && (
                      <>
                        <span>·</span>
                        <span className="text-accent">{term(ex.primaryMuscles[0])}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredActivities.map((act) => (
              <button
                key={act.id}
                className="press card flex items-center justify-between p-3 text-start"
                onClick={() => setSelectedEx(act)}
              >
                <div>
                  <p className="font-semibold text-[15px]">{act.ar}</p>
                  <p className="text-[12px] text-ink-2">{act.en}</p>
                </div>
                <div className="text-end">
                  <span className="num font-semibold text-accent text-[14px]">{act.met} MET</span>
                  <p className="text-[11px] text-ink-3">
                    {act.place === 'outside' ? L('خارجي', 'Outdoor') : act.place === 'home' ? L('منزلي', 'Home') : L('جيم', 'Gym')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected exercise / activity sheet */}
        {selectedEx && (
          <ExerciseDetailSheet
            item={selectedEx}
            onClose={() => setSelectedEx(null)}
            onAddToRoutine={onAddToRoutine}
          />
        )}
      </div>
    </Sheet>
  )
}

export function ExerciseDetailSheet({
  item,
  onClose,
  onAddToRoutine,
}: {
  item: LibraryExercise | Activity
  onClose: () => void
  onAddToRoutine?: (item: LibraryExercise | Activity) => void
}) {
  const isActivity = 'met' in item
  const ex = !isActivity ? (item as LibraryExercise) : null
  const act = isActivity ? (item as Activity) : null

  const bodyData: IExerciseData[] = useMemo(() => {
    if (!ex) return []
    return [{ name: ex.name, muscles: ex.bodyMuscles, frequency: 2 }]
  }, [ex])

  return (
    <Sheet
      title={isActivity ? L(act!.ar, act!.en) : ex!.name}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 pb-6">
        {!isActivity && ex && (
          <>
            {/* Animation / images */}
            <div className="h-56 w-full">
              <ExerciseAnimation images={ex.images} name={ex.name} className="size-full" />
            </div>

            {/* Title & subtitle */}
            <div>
              <h2 className="text-[20px] font-bold leading-tight" dir="ltr">{ex.name}</h2>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-full bg-fill px-3 py-1">🏷️ {term(ex.category)}</span>
              <span className="rounded-full bg-fill px-3 py-1">🔧 {ex.equipment ? term(ex.equipment) : L('وزن الجسم', 'Bodyweight')}</span>
              <span className="rounded-full bg-fill px-3 py-1">⚡ {term(ex.level)}</span>
              <span className="rounded-full bg-fill px-3 py-1">
                {ex.place === 'gym' ? L('🏋️ جيم', '🏋️ Gym') : ex.place === 'home' ? L('🏠 بيت', '🏠 Home') : L('🌳 خارجي', '🌳 Outside')}
              </span>
            </div>

            {/* Tip from legacy 53 if available */}
            {ex.tipAr && (
              <div className="card bg-accent/10 border-accent/20 text-[13px] leading-relaxed">
                <p className="font-semibold text-accent mb-0.5">💡 {L('نصيحة الأداء', 'Form tip')}</p>
                <p>{L(ex.tipAr, ex.tipEn || '')}</p>
              </div>
            )}

            {/* Muscles on body highlighter */}
            {ex.bodyMuscles.length > 0 && (
              <div className="card flex flex-col items-center gap-2">
                <p className="label self-start">{L('العضلات المستهدفة', 'Targeted muscles')}</p>
                <div className="flex justify-center gap-4">
                  <Model data={bodyData} style={{ width: 110, height: 160 }} type="anterior" />
                  <Model data={bodyData} style={{ width: 110, height: 160 }} type="posterior" />
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                  {ex.bodyMuscles.map((m) => (
                    <span key={m} className="rounded-full bg-accent/15 text-accent text-[11px] font-medium px-2.5 py-0.5">
                      {muscleName(m)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Instructions */}
            {ex.instructions.length > 0 && (
              <div className="card">
                <p className="label mb-2">{L('طريقة التمرين', 'Instructions')}</p>
                <ol className="list-decimal ps-5 space-y-2 text-[14px] leading-relaxed text-ink-2">
                  {ex.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}

        {isActivity && act && (
          <div className="flex flex-col gap-3">
            <div className="card flex items-center justify-between p-4">
              <div>
                <h2 className="text-[20px] font-bold">{act.ar}</h2>
                <p className="text-[13px] text-ink-2">{act.en}</p>
              </div>
              <span className="num font-bold text-[22px] text-accent">{act.met} MET</span>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2 px-1">
              {L(
                `معدل حرق الطاقة: ${act.met} MET. لشخص وزنه 75 كجم، 30 دقيقة تستهلك حوالي ${Math.round(act.met * 75 * 0.5)} سعر حراري.`,
                `Energy expenditure: ${act.met} MET. For a 75 kg person, 30 minutes burns ~${Math.round(act.met * 75 * 0.5)} kcal.`
              )}
            </p>
          </div>
        )}

        {/* Add to routine button */}
        {onAddToRoutine && (
          <button
            className="press mt-2 flex items-center justify-center gap-2 w-full rounded-2xl bg-accent py-3.5 font-semibold text-white"
            onClick={() => {
              onAddToRoutine(item)
              onClose()
            }}
          >
            <Plus size={18} /> {L('إضافة إلى الروتين', 'Add to routine')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
