import type { Muscle } from 'react-body-highlighter'
import { L } from './i18n.ts'

export type Place = 'gym' | 'home'
export interface Exercise { id: string; ar: string; en: string; muscles: Muscle[]; place: Place | 'both'; compound: boolean; tipAr: string; tipEn: string }

// [id, ar, en, muscles (primary first), place, compound, tip ar, tip en]
type Row = [string, string, string, Muscle[], Place | 'both', boolean, string, string]

const ROWS: Row[] = [
  // chest
  ['bench', 'بنش برس بار', 'Barbell bench press', ['chest', 'triceps', 'front-deltoids'], 'gym', true, 'لوحي الكتف لورا وتحت، البار ينزل لنص الصدر', 'Shoulder blades back and down, bar to mid-chest'],
  ['db_bench', 'بنش دمبل', 'Dumbbell bench press', ['chest', 'triceps', 'front-deltoids'], 'both', true, 'انزل لحد ما تحس بفرد في الصدر', 'Lower until you feel a stretch in the chest'],
  ['incline_db', 'إنكلاين دمبل', 'Incline dumbbell press', ['chest', 'front-deltoids', 'triceps'], 'both', true, 'زاوية 30 درجة كفاية', 'A 30° incline is enough'],
  ['incline_bench', 'إنكلاين بار', 'Incline barbell press', ['chest', 'front-deltoids', 'triceps'], 'gym', true, 'البار ينزل لأعلى الصدر', 'Bar to the upper chest'],
  ['chest_fly', 'تفتيح كابل / ماشين', 'Cable / machine fly', ['chest'], 'gym', false, 'كوعك مثني شوية وثابت', 'Keep a slight, fixed bend in the elbows'],
  ['dips', 'متوازي', 'Dips', ['chest', 'triceps', 'front-deltoids'], 'both', true, 'ميل لقدام شوية عشان الصدر', 'Lean forward a little to hit the chest'],
  ['pushup', 'ضغط', 'Push-ups', ['chest', 'triceps', 'front-deltoids'], 'both', true, 'جسمك خط واحد من الراس للكعب', 'Body in one line, head to heels'],
  ['machine_press', 'تشيست برس ماشين', 'Machine chest press', ['chest', 'triceps'], 'gym', true, 'المقبض في مستوى نص الصدر', 'Handles at mid-chest height'],
  // back
  ['deadlift', 'ديدلفت', 'Deadlift', ['lower-back', 'hamstring', 'gluteal', 'trapezius'], 'gym', true, 'ضهرك مفرود والبار لازق في رجلك', 'Flat back, bar stays against your legs'],
  ['pullup', 'عقلة', 'Pull-ups', ['upper-back', 'biceps', 'back-deltoids'], 'both', true, 'اسحب صدرك للبار، مش دقنك', 'Pull your chest to the bar, not your chin'],
  ['lat_pulldown', 'سحب أمامي', 'Lat pulldown', ['upper-back', 'biceps'], 'gym', true, 'اسحب بالكوع لتحت ولورا', 'Drive elbows down and back'],
  ['barbell_row', 'تجديف بار', 'Barbell row', ['upper-back', 'back-deltoids', 'biceps', 'lower-back'], 'gym', true, 'ميل 45 درجة والبار لبطنك', 'Hinge to 45°, row to your belly'],
  ['db_row', 'تجديف دمبل', 'One-arm dumbbell row', ['upper-back', 'back-deltoids', 'biceps'], 'both', true, 'اسحب لجنبك مش لصدرك', 'Row to your hip, not your chest'],
  ['cable_row', 'سحب أرضي', 'Seated cable row', ['upper-back', 'back-deltoids', 'biceps'], 'gym', true, 'صدرك لقدام واضغط لوحي الكتف', 'Chest up, squeeze the shoulder blades'],
  ['face_pull', 'فيس بول', 'Face pull', ['back-deltoids', 'trapezius'], 'gym', false, 'اسحب لوشك وافتح إيدك', 'Pull to your face, hands apart'],
  ['shrug', 'ترابيس دمبل', 'Dumbbell shrug', ['trapezius'], 'both', false, 'لفوق وثانية فوق، من غير لف', 'Straight up, pause, no rolling'],
  ['inverted_row', 'تجديف مقلوب', 'Inverted row', ['upper-back', 'biceps'], 'home', true, 'تحت ترابيزة متينة أو بار واطي', 'Under a sturdy table or low bar'],
  ['back_ext', 'ظهر سفلي (هايبر)', 'Back extension', ['lower-back', 'gluteal', 'hamstring'], 'both', false, 'اطلع لحد ما جسمك يبقى مفرود بس', 'Rise only to a straight line'],
  // shoulders
  ['ohp', 'ضغط كتف بار', 'Overhead press', ['front-deltoids', 'triceps', 'trapezius'], 'gym', true, 'شد بطنك ومؤخرتك، البار يطلع فوق راسك', 'Brace abs and glutes, bar over your head'],
  ['db_ohp', 'ضغط كتف دمبل', 'Dumbbell shoulder press', ['front-deltoids', 'triceps'], 'both', true, 'متقفلش كوعك قوي فوق', "Don't slam the elbows locked at the top"],
  ['lateral_raise', 'رفرفة جانبي', 'Lateral raise', ['front-deltoids', 'back-deltoids'], 'both', false, 'وزن خفيف، ارفع لمستوى الكتف بس', 'Light weight, raise to shoulder height'],
  ['rear_fly', 'رفرفة خلفي', 'Rear delt fly', ['back-deltoids', 'upper-back'], 'both', false, 'ميل لقدام وافتح بالكوع', 'Lean forward, lead with the elbows'],
  ['pike_pushup', 'ضغط بايك', 'Pike push-up', ['front-deltoids', 'triceps'], 'home', true, 'وسطك لفوق والراس بين إيديك', 'Hips high, head between your hands'],
  // arms
  ['bb_curl', 'باي بار', 'Barbell curl', ['biceps', 'forearm'], 'gym', false, 'كوعك ثابت جنبك', 'Elbows pinned at your sides'],
  ['db_curl', 'باي دمبل', 'Dumbbell curl', ['biceps', 'forearm'], 'both', false, 'لف كف إيدك لفوق وانت طالع', 'Turn palms up as you lift'],
  ['hammer_curl', 'هامر', 'Hammer curl', ['biceps', 'forearm'], 'both', false, 'الكف في وش بعض طول الحركة', 'Palms face each other the whole way'],
  ['cable_curl', 'باي كابل', 'Cable curl', ['biceps'], 'gym', false, 'شد مستمر، متسيبش تحت', 'Keep tension, no resting at the bottom'],
  ['triceps_pushdown', 'تراي كابل', 'Triceps pushdown', ['triceps'], 'gym', false, 'الكوع لازق في جنبك', 'Elbows glued to your sides'],
  ['skull_crusher', 'سكل كراشر', 'Skull crusher', ['triceps'], 'both', false, 'انزل ورا راسك مش على جبهتك', 'Lower behind your head, not to the forehead'],
  ['overhead_ext', 'تراي فوق الراس', 'Overhead triceps extension', ['triceps'], 'both', false, 'كوعك لقدام وقريب من راسك', 'Elbows forward, close to your head'],
  ['close_bench', 'بنش ضيق', 'Close-grip bench', ['triceps', 'chest'], 'gym', true, 'إيدك بعرض كتافك', 'Hands shoulder-width apart'],
  ['diamond_pushup', 'ضغط ماسي', 'Diamond push-up', ['triceps', 'chest'], 'home', true, 'إيديك تحت صدرك على شكل ماسة', 'Hands under your chest in a diamond'],
  // legs
  ['squat', 'سكوات بار', 'Barbell back squat', ['quadriceps', 'gluteal', 'adductor'], 'gym', true, 'انزل لحد ما فخدك يوازي الأرض، ركبك مع صوابعك', 'Thighs to parallel, knees track the toes'],
  ['goblet_squat', 'سكوات دمبل (جوبلت)', 'Goblet squat', ['quadriceps', 'gluteal'], 'both', true, 'الدمبل لازق في صدرك', 'Dumbbell held tight to your chest'],
  ['bw_squat', 'سكوات بوزن الجسم', 'Bodyweight squat', ['quadriceps', 'gluteal'], 'home', true, 'ببطء: 3 ثواني نازل', 'Slow: three seconds down'],
  ['leg_press', 'ليج برس', 'Leg press', ['quadriceps', 'gluteal'], 'gym', true, 'متقفلش ركبتك فوق', "Don't lock your knees at the top"],
  ['rdl', 'رومانيان ديدلفت', 'Romanian deadlift', ['hamstring', 'gluteal', 'lower-back'], 'both', true, 'وسطك لورا والركبة مثنية شوية', 'Push hips back, soft knees'],
  ['lunge', 'طعن', 'Lunges', ['quadriceps', 'gluteal', 'hamstring'], 'both', true, 'خطوة واسعة والركبة اللي ورا قرب الأرض', 'Long step, back knee near the floor'],
  ['bulgarian', 'بلغاري سبليت سكوات', 'Bulgarian split squat', ['quadriceps', 'gluteal'], 'both', true, 'رجلك اللي ورا على كرسي', 'Back foot up on a bench'],
  ['leg_ext', 'رفرفة أمامي', 'Leg extension', ['quadriceps'], 'gym', false, 'اضغط فوق ثانية', 'Squeeze for a second at the top'],
  ['leg_curl', 'رفرفة خلفي', 'Leg curl', ['hamstring'], 'gym', false, 'رجّع ببطء', 'Lower slowly'],
  ['hip_thrust', 'هيب ثرست', 'Hip thrust', ['gluteal', 'hamstring'], 'both', true, 'دقنك لتحت واضغط المؤخرة فوق', 'Chin tucked, squeeze glutes at the top'],
  ['glute_bridge', 'جسر أرضي', 'Glute bridge', ['gluteal', 'hamstring'], 'home', false, 'اضغط بالكعب', 'Drive through your heels'],
  ['calf_raise', 'سمانة', 'Calf raise', ['calves'], 'both', false, 'انزل لآخر مدى واطلع على أطراف صوابعك', 'Full stretch down, up onto your toes'],
  ['abductor', 'أبعدات ماشين', 'Hip abduction machine', ['abductors', 'gluteal'], 'gym', false, 'ببطء ومن غير زق', 'Slow, no bouncing'],
  ['adductor_m', 'ضامات ماشين', 'Hip adduction machine', ['adductor'], 'gym', false, 'متفتحش أكتر من راحتك', "Don't open past comfortable"],
  // core
  ['plank', 'بلانك', 'Plank', ['abs', 'obliques'], 'both', false, 'اضغط بطنك ومتنزلش وسطك', "Brace your abs, don't let the hips sag"],
  ['crunch', 'كرانش', 'Crunch', ['abs'], 'both', false, 'اطلع بالبطن مش برقبتك', 'Curl with your abs, not your neck'],
  ['leg_raise', 'رفع رجل', 'Hanging / lying leg raise', ['abs'], 'both', false, 'من غير مرجحة', 'No swinging'],
  ['russian_twist', 'روشن تويست', 'Russian twist', ['obliques', 'abs'], 'both', false, 'لف من الصدر مش الإيدين بس', 'Rotate the torso, not just the arms'],
  ['cable_crunch', 'كرانش كابل', 'Cable crunch', ['abs'], 'gym', false, 'لف ضهرك لتحت، وسطك ثابت', 'Round down, hips stay still'],
  ['side_plank', 'بلانك جانبي', 'Side plank', ['obliques'], 'both', false, 'جسمك خط مستقيم', 'Body in a straight line'],
  ['superman', 'سوبرمان', 'Superman', ['lower-back', 'gluteal', 'upper-back'], 'home', false, 'ارفع إيديك ورجليك سوا واثبت ثانية', 'Lift arms and legs together, hold a second'],
  // forearm / misc
  ['farmer_walk', 'مشية الفلاح', "Farmer's walk", ['forearm', 'trapezius', 'abs'], 'both', true, 'دمبلين تقال وامشي مفرود', 'Heavy dumbbells, walk tall'],
]

/** Exercises that need nothing but your body (and the floor or a chair). */
export const NO_EQUIPMENT = new Set(['pushup', 'pike_pushup', 'diamond_pushup', 'bw_squat', 'lunge', 'bulgarian', 'glute_bridge', 'calf_raise', 'plank', 'side_plank', 'crunch', 'leg_raise', 'russian_twist', 'superman'])

export const EXERCISES: Record<string, Exercise> = Object.fromEntries(
  ROWS.map(([id, ar, en, muscles, place, compound, tipAr, tipEn]) => [id, { id, ar, en, muscles, place, compound, tipAr, tipEn }]),
)
// gym exercise names are shown in English in both languages (that's what people know them by); Arabic stays searchable
export const exName = (id: string) => EXERCISES[id]?.en ?? id

export const MUSCLE_LABEL: Partial<Record<Muscle, [string, string]>> = {
  chest: ['صدر', 'Chest'], 'upper-back': ['ضهر', 'Upper back'], 'lower-back': ['أسفل الضهر', 'Lower back'], trapezius: ['ترابيس', 'Traps'],
  'front-deltoids': ['كتف أمامي', 'Front delts'], 'back-deltoids': ['كتف خلفي', 'Rear delts'], biceps: ['باي', 'Biceps'], triceps: ['تراي', 'Triceps'],
  forearm: ['ساعد', 'Forearms'], abs: ['بطن', 'Abs'], obliques: ['جوانب', 'Obliques'], quadriceps: ['أمامي الفخد', 'Quads'], hamstring: ['خلفي الفخد', 'Hamstrings'],
  gluteal: ['مؤخرة', 'Glutes'], calves: ['سمانة', 'Calves'], adductor: ['ضامات', 'Adductors'], abductors: ['أبعدات', 'Abductors'],
}
export const muscleName = (m: Muscle) => { const x = MUSCLE_LABEL[m]; return x ? L(x[0], x[1]) : m }

// ── programs ── each day: [exercise, sets, reps]
export type Slot = [string, number, string]
export interface ProgramDay { ar: string; en: string; slots: Slot[] }
export interface Program { id: string; ar: string; en: string; place: Place; days: ProgramDay[]; forDays: number[] }

export const PROGRAMS: Program[] = [
  {
    id: 'full_body', ar: 'جسم كامل (A/B)', en: 'Full body (A/B)', place: 'gym', forDays: [2, 3],
    days: [
      { ar: 'جسم كامل A', en: 'Full body A', slots: [['squat', 3, '6-8'], ['bench', 3, '6-8'], ['barbell_row', 3, '8-10'], ['lateral_raise', 2, '12-15'], ['db_curl', 2, '10-12'], ['plank', 3, '30-45s']] },
      { ar: 'جسم كامل B', en: 'Full body B', slots: [['rdl', 3, '8-10'], ['incline_db', 3, '8-10'], ['lat_pulldown', 3, '10-12'], ['db_ohp', 3, '8-10'], ['triceps_pushdown', 2, '10-12'], ['leg_raise', 3, '10-15']] },
    ],
  },
  {
    id: 'upper_lower', ar: 'علوي / سفلي', en: 'Upper / Lower', place: 'gym', forDays: [4],
    days: [
      { ar: 'علوي (قوة)', en: 'Upper (strength)', slots: [['bench', 4, '5-7'], ['barbell_row', 4, '6-8'], ['ohp', 3, '6-8'], ['lat_pulldown', 3, '8-10'], ['bb_curl', 2, '8-10'], ['skull_crusher', 2, '8-10']] },
      { ar: 'سفلي (قوة)', en: 'Lower (strength)', slots: [['squat', 4, '5-7'], ['rdl', 3, '6-8'], ['leg_press', 3, '10-12'], ['leg_curl', 3, '10-12'], ['calf_raise', 3, '12-15'], ['plank', 3, '45s']] },
      { ar: 'علوي (حجم)', en: 'Upper (volume)', slots: [['incline_db', 3, '8-12'], ['cable_row', 3, '10-12'], ['db_ohp', 3, '10-12'], ['chest_fly', 3, '12-15'], ['lateral_raise', 3, '12-15'], ['hammer_curl', 3, '10-12'], ['overhead_ext', 3, '10-12']] },
      { ar: 'سفلي (حجم)', en: 'Lower (volume)', slots: [['deadlift', 3, '4-6'], ['bulgarian', 3, '8-10'], ['hip_thrust', 3, '10-12'], ['leg_ext', 3, '12-15'], ['calf_raise', 3, '15-20'], ['cable_crunch', 3, '12-15']] },
    ],
  },
  {
    id: 'ppl', ar: 'دفع / سحب / رجل', en: 'Push / Pull / Legs', place: 'gym', forDays: [3, 5, 6],
    days: [
      { ar: 'دفع (صدر، كتف، تراي)', en: 'Push (chest, shoulders, triceps)', slots: [['bench', 4, '6-8'], ['incline_db', 3, '8-10'], ['ohp', 3, '8-10'], ['lateral_raise', 3, '12-15'], ['triceps_pushdown', 3, '10-12'], ['overhead_ext', 2, '10-12']] },
      { ar: 'سحب (ضهر، باي)', en: 'Pull (back, biceps)', slots: [['deadlift', 3, '5'], ['pullup', 3, '6-10'], ['cable_row', 3, '10-12'], ['face_pull', 3, '12-15'], ['bb_curl', 3, '8-10'], ['hammer_curl', 2, '10-12']] },
      { ar: 'رجل', en: 'Legs', slots: [['squat', 4, '6-8'], ['rdl', 3, '8-10'], ['leg_press', 3, '10-12'], ['leg_curl', 3, '10-12'], ['calf_raise', 4, '12-15'], ['leg_raise', 3, '12-15']] },
    ],
  },
  {
    id: 'home_full', ar: 'البيت — جسم كامل', en: 'Home — full body', place: 'home', forDays: [2, 3, 4, 5, 6],
    days: [
      { ar: 'بيت A', en: 'Home A', slots: [['goblet_squat', 3, '10-15'], ['pushup', 3, '8-15'], ['db_row', 3, '10-12'], ['db_ohp', 3, '8-12'], ['glute_bridge', 3, '15'], ['plank', 3, '30-45s']] },
      { ar: 'بيت B', en: 'Home B', slots: [['lunge', 3, '10/leg'], ['incline_db', 3, '8-12'], ['inverted_row', 3, '8-12'], ['pike_pushup', 3, '6-10'], ['rdl', 3, '10-12'], ['russian_twist', 3, '20']] },
    ],
  },
  {
    id: 'bodyweight', ar: 'من غير أدوات', en: 'No equipment', place: 'home', forDays: [2, 3, 4, 5, 6],
    days: [
      { ar: 'وزن الجسم A', en: 'Bodyweight A', slots: [['bw_squat', 3, '15-20'], ['pushup', 3, '8-15'], ['superman', 3, '12-15'], ['pike_pushup', 3, '6-10'], ['glute_bridge', 3, '15-20'], ['plank', 3, '30-45s']] },
      { ar: 'وزن الجسم B', en: 'Bodyweight B', slots: [['lunge', 3, '10/leg'], ['diamond_pushup', 3, '6-12'], ['bulgarian', 3, '8-12'], ['calf_raise', 3, '15-20'], ['leg_raise', 3, '10-15'], ['side_plank', 3, '30s']] },
    ],
  },
]

/** True when every exercise in the program needs no equipment. */
export const isNoEquipment = (p: Program) => p.days.every((d) => d.slots.every(([id]) => NO_EQUIPMENT.has(id)))

/** Suggested program from days/week, where they train, and whether they have any equipment. */
export function suggestProgram(days: number, place: Place, noEquipment = false): Program {
  if (noEquipment) return PROGRAMS.find(isNoEquipment)!
  if (place === 'home') return PROGRAMS.find((p) => p.id === 'home_full')!
  return PROGRAMS.find((p) => p.place === 'gym' && p.forDays.includes(days)) ?? PROGRAMS[0]
}

/** Estimated 1-rep max (Epley) — how PRs are compared across different rep counts. */
export const e1rm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30))

/** Strength training ≈ 5 METs → kcal = MET × kg × hours. */
export const workoutKcal = (minutes: number, bodyKg: number) => Math.round(5 * bodyKg * (minutes / 60))
