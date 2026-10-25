// Exercise Library: 870+ exercises from free-exercise-db + ~40 outdoor/cardio activities.
import type { Muscle } from 'react-body-highlighter'
import { EXERCISES } from './exercises.ts'
import { norm } from './parser.ts'

export type Place = 'gym' | 'home' | 'outside'

export interface RawExercise {
  id: string
  name: string
  category: string
  equipment: string | null
  level: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  images: string[]
}

export interface LibraryExercise extends RawExercise {
  arName?: string
  tipAr?: string
  tipEn?: string
  place: Place
  bodyMuscles: Muscle[]
}

export interface Activity {
  id: string
  ar: string
  en: string
  met: number
  place: Place
  'category': 'cardio' | 'sport' | 'flexibility'
}

/** Calories burned = MET × kg bodyweight × hours */
export function activityKcal(met: number, kg: number, minutes: number): number {
  if (met <= 0 || kg <= 0 || minutes <= 0) return 0
  return Math.round(met * kg * (minutes / 60))
}

/** Dataset muscle name -> react-body-highlighter Muscle keys */
export const DATASET_TO_BODY_MUSCLES: Record<string, Muscle[]> = {
  abdominals: ['abs'],
  abductors: ['abductors'],
  adductors: ['adductor'],
  biceps: ['biceps'],
  calves: ['calves'],
  chest: ['chest'],
  forearms: ['forearm'],
  glutes: ['gluteal'],
  hamstrings: ['hamstring'],
  lats: ['upper-back'],
  'lower back': ['lower-back'],
  'middle back': ['upper-back'],
  neck: ['neck'],
  quadriceps: ['quadriceps'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  traps: ['trapezius'],
  triceps: ['triceps'],
}

export function mapDatasetMuscles(muscles: string[]): Muscle[] {
  const set = new Set<Muscle>()
  for (const m of muscles) {
    const list = DATASET_TO_BODY_MUSCLES[m.toLowerCase()]
    if (list) for (const item of list) set.add(item)
  }
  return [...set]
}

/** Classify environment from equipment and category */
export function classifyPlace(equipment: string | null, category?: string): Place {
  if (category === 'cardio' && (!equipment || equipment === 'body only' || equipment === 'other')) {
    return 'outside'
  }
  const eq = (equipment || '').toLowerCase()
  if (eq === 'barbell' || eq === 'machine' || eq === 'cable' || eq === 'e-z curl bar') {
    return 'gym'
  }
  return 'home'
}

/** ~40 outdoor, sport, and cardio activities with MET values */
export const ACTIVITIES: Activity[] = [
  { id: 'walking_brisk', ar: 'مشي سريع (5 كم/س)', en: 'Brisk walking (5 km/h)', met: 3.8, place: 'outside', category: 'cardio' },
  { id: 'walking_light', ar: 'مشي هادي', en: 'Casual walking', met: 2.8, place: 'outside', category: 'cardio' },
  { id: 'running_slow', ar: 'جري خفيف / هرولة (8 كم/س)', en: 'Jogging (8 km/h)', met: 8.3, place: 'outside', category: 'cardio' },
  { id: 'running_fast', ar: 'جري سريع (11 كم/س)', en: 'Running (11 km/h)', met: 11.5, place: 'outside', category: 'cardio' },
  { id: 'running_sprint', ar: 'سبرينت وسرعات', en: 'Sprints', met: 14.5, place: 'outside', category: 'cardio' },
  { id: 'cycling_leisure', ar: 'عجل ترفيهي هادي', en: 'Cycling (leisure)', met: 5.8, place: 'outside', category: 'cardio' },
  { id: 'cycling_moderate', ar: 'عجل متوسط (20 كم/س)', en: 'Cycling (moderate, 20 km/h)', met: 8.0, place: 'outside', category: 'cardio' },
  { id: 'cycling_vigorous', ar: 'عجل سريع / سباق', en: 'Cycling (fast/racing)', met: 11.0, place: 'outside', category: 'cardio' },
  { id: 'stationary_bike', ar: 'عجلة ثابتة', en: 'Stationary bike', met: 6.8, place: 'gym', category: 'cardio' },
  { id: 'swimming_freestyle', ar: 'سباحة حرة متوسطة', en: 'Swimming (freestyle, moderate)', met: 7.0, place: 'outside', category: 'cardio' },
  { id: 'swimming_vigorous', ar: 'سباحة سريعة', en: 'Swimming (vigorous)', met: 9.8, place: 'outside', category: 'cardio' },
  { id: 'football', ar: 'كرة قدم', en: 'Football / Soccer', met: 8.0, place: 'outside', category: 'sport' },
  { id: 'padel', ar: 'بادل', en: 'Padel', met: 6.5, place: 'outside', category: 'sport' },
  { id: 'tennis', ar: 'تنس أرضي', en: 'Tennis', met: 7.3, place: 'outside', category: 'sport' },
  { id: 'basketball', ar: 'كرة سلة', en: 'Basketball', met: 8.0, place: 'outside', category: 'sport' },
  { id: 'volleyball', ar: 'كرة طائرة', en: 'Volleyball', met: 4.0, place: 'outside', category: 'sport' },
  { id: 'squash', ar: 'اسكواش', en: 'Squash', met: 12.0, place: 'gym', category: 'sport' },
  { id: 'table_tennis', ar: 'بينج بونج', en: 'Table tennis', met: 4.0, place: 'home', category: 'sport' },
  { id: 'hiking', ar: 'هايكنج ومشي جبلي', en: 'Hiking', met: 6.0, place: 'outside', category: 'cardio' },
  { id: 'stairs', ar: 'طلوع سلم', en: 'Stair climbing', met: 8.8, place: 'home', category: 'cardio' },
  { id: 'jump_rope', ar: 'نط حبل', en: 'Jump rope', met: 10.0, place: 'home', category: 'cardio' },
  { id: 'jump_rope_fast', ar: 'نط حبل سريع', en: 'Jump rope (fast)', met: 12.3, place: 'home', category: 'cardio' },
  { id: 'boxing_bag', ar: 'ملاكمة كيس رمل', en: 'Boxing (heavy bag)', met: 6.0, place: 'gym', category: 'sport' },
  { id: 'boxing_sparring', ar: 'ملاكمة سبارينج', en: 'Boxing (sparring)', met: 9.0, place: 'gym', category: 'sport' },
  { id: 'kickboxing', ar: 'كيك بوكسينج', en: 'Kickboxing', met: 10.0, place: 'gym', category: 'sport' },
  { id: 'bjj_wrestling', ar: 'مصارعة / BJJ', en: 'BJJ / Wrestling', met: 10.2, place: 'gym', category: 'sport' },
  { id: 'karate_taekwondo', ar: 'كاراتيه / تايكوندو', en: 'Karate / Taekwondo', met: 8.0, place: 'gym', category: 'sport' },
  { id: 'yoga_gentle', ar: 'يوجا هادية', en: 'Gentle yoga', met: 2.5, place: 'home', category: 'flexibility' },
  { id: 'yoga_power', ar: 'يوجا ديناميكية', en: 'Power yoga', met: 4.0, place: 'home', category: 'flexibility' },
  { id: 'pilates', ar: 'بيلاتس', en: 'Pilates', met: 3.5, place: 'home', category: 'flexibility' },
  { id: 'hiit', ar: 'HIIT هييت عالي الكثافة', en: 'HIIT', met: 9.5, place: 'home', category: 'cardio' },
  { id: 'calisthenics', ar: 'كاليسثنكس وزن الجسم', en: 'Calisthenics', met: 7.0, place: 'outside', category: 'sport' },
  { id: 'rowing_machine', ar: 'تجديف ماشين', en: 'Rowing machine', met: 7.0, place: 'gym', category: 'cardio' },
  { id: 'elliptical', ar: 'إبتيكال', en: 'Elliptical trainer', met: 6.5, place: 'gym', category: 'cardio' },
  { id: 'treadmill_incline', ar: 'مشاية مائلة (إنكلاين)', en: 'Incline treadmill walk', met: 7.0, place: 'gym', category: 'cardio' },
  { id: 'dancing', ar: 'رقص وإيروبكس', en: 'Aerobic dancing', met: 6.0, place: 'home', category: 'cardio' },
  { id: 'badminton', ar: 'ريشة طايرة', en: 'Badminton', met: 4.5, place: 'outside', category: 'sport' },
  { id: 'horse_riding', ar: 'فروسية وركوب خيل', en: 'Horseback riding', met: 5.5, place: 'outside', category: 'sport' },
  { id: 'skating', ar: 'باتيناج وتزلج', en: 'Roller skating', met: 7.0, place: 'outside', category: 'sport' },
  { id: 'crossfit', ar: 'كروس فيت', en: 'CrossFit WOD', met: 8.5, place: 'gym', category: 'sport' },
  { id: 'stretching', ar: 'إطالات ومرونة', en: 'Stretching', met: 2.3, place: 'home', category: 'flexibility' },
]

/** Map the 53 existing exercise keys to dataset IDs */
export const MAP_53_TO_DATASET: Record<string, string> = {
  'bench': 'Barbell_Bench_Press_-_Medium_Grip',
  'db_bench': 'Dumbbell_Bench_Press',
  'incline_db': 'Incline_Dumbbell_Press',
  'incline_bench': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'chest_fly': 'Cable_Crossover',
  'dips': 'Dips_-_Chest_Version',
  'pushup': 'Pushups',
  'machine_press': 'Leverage_Chest_Press',
  'deadlift': 'Barbell_Deadlift',
  'pullup': 'Pullups',
  'lat_pulldown': 'Wide-Grip_Lat_Pulldown',
  'barbell_row': 'Bent_Over_Barbell_Row',
  'db_row': 'One-Arm_Dumbbell_Row',
  'cable_row': 'Seated_Cable_Rows',
  'face_pull': 'Face_Pull',
  'shrug': 'Dumbbell_Shrug',
  'inverted_row': 'Inverted_Row',
  'back_ext': 'Hyperextensions_Back_Extensions',
  'ohp': 'Standing_Military_Press',
  'db_ohp': 'Dumbbell_Shoulder_Press',
  'lateral_raise': 'Side_Lateral_Raise',
  'rear_fly': 'Seated_Bent-Over_Rear_Delt_Raise',
  'pike_pushup': 'Pushups',
  'bb_curl': 'Barbell_Curl',
  'db_curl': 'Dumbbell_Bicep_Curl',
  'hammer_curl': 'Hammer_Curls',
  'cable_curl': 'Cable_Preacher_Curl',
  'triceps_pushdown': 'Triceps_Pushdown',
  'skull_crusher': 'Lying_Triceps_Press',
  'overhead_ext': 'Standing_Dumbbell_Triceps_Extension',
  'close_bench': 'Close-Grip_Barbell_Bench_Press',
  'diamond_pushup': 'Push-Ups_-_Close_Triceps_Position',
  'squat': 'Barbell_Squat',
  'goblet_squat': 'Goblet_Squat',
  'bw_squat': 'Bodyweight_Squat',
  'leg_press': 'Leg_Press',
  'rdl': 'Romanian_Deadlift',
  'lunge': 'Dumbbell_Lunges',
  'bulgarian': 'Split_Squats',
  'leg_ext': 'Leg_Extensions',
  'leg_curl': 'Seated_Leg_Curl',
  'hip_thrust': 'Barbell_Hip_Thrust',
  'glute_bridge': 'Barbell_Glute_Bridge',
  'calf_raise': 'Standing_Calf_Raises',
  'abductor': 'Thigh_Abductor',
  'adductor_m': 'Thigh_Adductor',
  'plank': 'Plank',
  'crunch': 'Crunches',
  'leg_raise': 'Hanging_Leg_Raise',
  'russian_twist': 'Russian_Twist',
  'cable_crunch': 'Cable_Crunch',
  'side_plank': 'Side_Bridge',
  'farmer_walk': 'Farmers_Walk',
}

const DATASET_TO_53 = Object.fromEntries(Object.entries(MAP_53_TO_DATASET).map(([k, v]) => [v, k]))

/** Arabic names for ~150 popular dataset exercises */
export const DATASET_AR_NAMES: Record<string, string> = {
  // Chest
  'Decline_Barbell_Bench_Press': 'بنش ديكلاين بار (مائل لأسفل)',
  'Decline_Dumbbell_Bench_Press': 'بنش ديكلاين دمبل',
  'Cable_Iron_Cross': 'كروس كابل حديد',
  'Dumbbell_Flyes': 'تفتيح دمبل مستوي',
  'Incline_Dumbbell_Flyes': 'تفتيح دمبل إنكلاين',
  'Decline_Dumbbell_Flyes': 'تفتيح دمبل ديكلاين',
  'Butterfly': 'فراشة (باترفلاي)',
  'Machine_Bench_Press': 'بنش برس ماشين',
  'Wide-Grip_Barbell_Bench_Press': 'بنش بار قبضة واسعة',
  'Chest_Dip': 'متوازي للصدر',
  'Low_Cable_Crossover': 'كابل كروس من تحت لفوق',
  'Incline_Cable_Flye': 'تفتيح كابل إنكلاين',
  // Back
  'Lat_Pulldown': 'سحب ظهر أمامي كابل',
  'Close-Grip_Front_Lat_Pulldown': 'سحب عالي قبضة ضيقة مقلوبة',
  'Underhand_Cable_Pulldowns': 'سحب عالي أندرهاند',
  'V-Bar_Pulldown': 'سحب عالي مقبض V',
  'Straight-Arm_Pulldown': 'سحب ظهر مستقيم واقف (استريت أرم)',
  'T-Bar_Row_with_Handle': 'تي بار رو بالمسكة',
  'One-Arm_Long_Bar_Row': 'تجديف بار طرفي يد واحدة',
  'Reverse_Grip_Bent-Over_Row': 'تجديف بار قبضة مقلوبة (يينتس رو)',
  'Pendlay_Row': 'بندلاي رو (سحب من الأرض)',
  'Kneeling_Single_Arm_High_Pulley_Row': 'سحب كابل مفرد على الركبة',
  'Rack_Delivery': 'ديدلفت من الراك (راك بول)',
  'Rack_Pulls': 'راك بول لأسفل الظهر والترابيس',
  'Good_Morning': 'جود مورنينج بالبار للظهر الخلفي',
  // Shoulders
  'Arnold_Dumbbell_Press': 'أرنولد برس دمبل',
  'Military_Press': 'ميليتاري برس واقف',
  'Front_Dumbbell_Raise': 'رفرفة أمامي دمبل',
  'Front_Barbell_Raise': 'رفرفة أمامي بار',
  'Cable_Front_Raise': 'رفرفة أمامي كابل',
  'Cable_Seated_Lateral_Raise': 'رفرفة جانبي كابل وأنت قاعد',
  'Cable_Rear_Delt_Fly': 'رفرفة خلفي كابل',
  'Face_Pull': 'فيس بول كابل بالحبل للكتف الخلفي',
  'Upright_Barbell_Row': 'سحب عمودي بار للترابيس والكتف',
  'Upright_Cable_Row': 'سحب عمودي كابل',
  'Smith_Machine_Overhead_Shoulder_Press': 'كتف سميث أمامي',
  'Behind_The_Neck_Press': 'ضغط كتف خلف الرقبة بالبار',
  // Arms: Biceps
  'Preacher_Curl': 'باي بريتشر (لاري سكوت)',
  'EZ-Bar_Curl': 'باي بار زجزاج',
  'Concentration_Curls': 'باي تركيز دمبل (كونسنتريشن)',
  'Incline_Dumbbell_Curl': 'باي دمبل إنكلاين مائل',
  'Spider_Curl': 'سبايدر كيرل على البنش المائل',
  'Cross_Body_Hammer_Curl': 'هامر كروس عبر الصدر',
  'Cable_Bicep_Curl': 'باي كابل واقف بالحبل أو المسطرة',
  'Overhead_Cable_Curl': 'باي كابل من فوق (وضع الدبل باي)',
  'High_Cable_Curls': 'هاي كابل كيرل',
  'Alternate_Hammer_Curl': 'هامر بالتبادل',
  // Arms: Triceps
  'Triceps_Rope_Pushdown': 'تراي كابل بالحبل',
  'Reverse_Grip_Triceps_Pushdown': 'تراي كابل قبضة مقلوبة',
  'Lying_Dumbbell_Tricep_Extension': 'سكل كراشر دمبل وأنت نايم',
  'Seated_Triceps_Press': 'تراي دمبل فرنساوي قاعد',
  'Bench_Dips': 'تراي ديبس على البنش',
  'Cable_One_Arm_Tricep_Extension': 'تراي كابل فردي يد واحدة',
  'Tate_Press': 'تيت برس دمبل للتراي',
  'Kickback': 'تراي كيك باك بالدمبل',
  // Legs: Quads & Glutes
  'Front_Barbell_Squat': 'فرونت سكوات (سكوات أمامي بالبار)',
  'Hack_Squat': 'هاك سكوات ماشين',
  'Box_Squat': 'بوكس سكوات على صندوق',
  'Barbell_Lunge': 'لانجز بالبار',
  'Walking_Lunges': 'لانجز مشي بالدمبل',
  'Reverse_Lunges': 'طعن خلفي بالدمبل',
  'Step-up_with_Dumbbells': 'صعود على بنش أو صندوق بالدمبل',
  'Sissy_Squat': 'سيسي سكوات للأماميات',
  'Zercher_Squat': 'زيرتشر سكوات بين الكوعين',
  // Legs: Hamstrings & Calves
  'Sumo_Deadlift': 'سومو ديدلفت بالبار',
  'Stiff-Legged_Barbell_Deadlift': 'ديدلفت أرجل مستقيمة (ستيف ليج)',
  'Stiff-Legged_Dumbbell_Deadlift': 'ديدلفت دمبل أرجل مستقيمة',
  'Lying_Leg_Curls': 'خلفيات نائم ماشين',
  'Standing_Leg_Curl': 'خلفيات واقف ماشين',
  'Seated_Calf_Raise': 'سمانة وأنت قاعد ماشين',
  'Donkey_Calf_Raises': 'دونكي كالف ريز للسمانة',
  'Calf_Press_On_The_Leg_Press_Machine': 'سمانة على الليج برس',
  // Core
  'Ab_Crunch_Machine': 'بطن كرانش ماشين',
  'Hanging_Knee_Raise': 'رفع ركب متعلق في العقلة',
  'Hanging_Leg_Raise': 'رفع أرجل كامل متعلق',
  'Decline_Crunch': 'كرانش ديكلاين على بنش مائل',
  'Bicycle_Krunches': 'كرانش عجلة لتقوية عضلات البطن',
  'Dragon_Flag': 'دراجون فلاج بروس لي للبطن',
  'Ab_Wheel_Rollout': 'عجلة البطن (رول آوت)',
  'Woodchoppers': 'وود تشوبر حطاب كابل للأجناب',
  'Windshield_Wipers': 'مساحات سيارة متعلق للوسط والأجناب',
  'Bottoms_Up': 'رفع الحوض لأعلى للبطن السفلية',
  'Seated_Flat_Bench_Leg_Pull-In': 'سحب ركب على حافة البنش',
  // Forearms & Misc
  'Wrist_Curl': 'ريست بار سواعد وأنت ساند',
  'Reverse_Wrist_Curl': 'ريست عكسي بار للسواعد الخارجية',
  'Standing_Dumbbell_Upright_Row': 'ترابيس ورو عمودي بالدمبل',
  'Plate_Pinch': 'مسك طارات بالأصابع لقوة القبضة',
  'Clean_and_Press': 'كلين آند برس أولمبي',
  'Snatch': 'خطف أولمبي (سناش)',
  'Push_Press': 'بوش برس حركي للكتف',
}

let libraryCache: Promise<LibraryExercise[]> | null = null

/** Load and enrich the exercises dataset */
export function loadLibrary(): Promise<LibraryExercise[]> {
  if (libraryCache) return libraryCache
  libraryCache = fetch('/exercises.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load exercises: ${r.status}`)
      return r.json() as Promise<RawExercise[]>
    })
    .then((raw) => {
      return raw.map((ex): LibraryExercise => {
        const mapped53Key = DATASET_TO_53[ex.id]
        const legacy53 = mapped53Key ? EXERCISES[mapped53Key] : undefined
        const arName = legacy53 ? legacy53.ar : DATASET_AR_NAMES[ex.id]
        const tipAr = legacy53?.tipAr
        const tipEn = legacy53?.tipEn
        const place = classifyPlace(ex.equipment, ex.category)
        const bodyMuscles = mapDatasetMuscles([...ex.primaryMuscles, ...ex.secondaryMuscles])

        return {
          ...ex,
          arName,
          tipAr,
          tipEn,
          place,
          bodyMuscles,
        }
      })
    })
    .catch((err) => {
      libraryCache = null
      throw err
    })
  return libraryCache
}

export interface LibraryFilters {
  place?: Place | 'all'
  equipment?: string | 'all'
  muscle?: Muscle | 'all'
  category?: string | 'all'
  level?: string | 'all'
}

/** Pure search & filter over exercises */
export function searchLibrary(
  query: string,
  exercises: LibraryExercise[],
  filters?: LibraryFilters,
): LibraryExercise[] {
  const q = norm(query.trim())

  return exercises.filter((ex) => {
    if (filters) {
      if (filters.place && filters.place !== 'all' && ex.place !== filters.place) return false
      if (filters.equipment && filters.equipment !== 'all') {
        const eq = (ex.equipment || '').toLowerCase()
        if (eq !== filters.equipment.toLowerCase()) return false
      }
      if (filters.muscle && filters.muscle !== 'all') {
        if (!ex.bodyMuscles.includes(filters.muscle as Muscle)) return false
      }
      if (filters.category && filters.category !== 'all') {
        if (ex.category.toLowerCase() !== filters.category.toLowerCase()) return false
      }
      if (filters.level && filters.level !== 'all') {
        if (ex.level.toLowerCase() !== filters.level.toLowerCase()) return false
      }
    }

    if (!q) return true

    // Match query against English name, Arabic name, id, category, primary muscles
    const matchEn = norm(ex.name).includes(q)
    const matchAr = ex.arName ? norm(ex.arName).includes(q) : false
    const matchId = norm(ex.id.replaceAll('_', ' ')).includes(q)
    const matchCat = norm(ex.category).includes(q)
    const matchMuscles = ex.primaryMuscles.some((m) => norm(m).includes(q))

    return matchEn || matchAr || matchId || matchCat || matchMuscles
  })
}
