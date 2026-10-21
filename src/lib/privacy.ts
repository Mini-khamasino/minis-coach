import { norm } from './parser.ts'

// Privacy gate: decided on the phone, before anything leaves it. Personal topics never reach the AI.

export type Sensitivity = 'ok' | 'private' | 'eating' | 'crisis'

const CRISIS = /انتحر|اموت نفسي|عايز اموت|نفسي اموت|اذي نفسي|اأذي نفسي|suicid|kill myself|self ?harm|end my life|want to die/
const EATING = /ارجع الاكل|ارجع اللي كلته|بستفرغ|استفرغ|اطرش|بطرش|بولوميا|بوليميا|انوركسيا|انوريكسيا|مبكلش خالص|مش باكل خالص|purg|throw(ing)? up after|make myself (sick|vomit)|binge|bulimi|anorexi|starving myself/
// phrases and whole words about health, medicine, body, mind, relationships and money
const PRIVATE_PHRASES = /عندي سكر|مريض سكر|ضغطي|ضغط عالي|الدوره الشهريه|دكتور قالي|الدكتور قال|blood pressure|my doctor|birth control/
const PRIVATE_WORDS = new Set(('دوا دواء ادويه حبوب برشام علاج روشته مرض مريض مريضه كوليسترول الغده غده انسولين اوزمبك مونجارو حامل حمل رضاعه برضع بريود حيض تكيس اكتئاب مكتئب مكتئبه قلقان قلق نفسيتي سرطان عمليه خطيبتي مراتي جوزي طليقي طلاق مرتبي ديون '
  + 'meds medication medicine pills insulin metformin ozempic mounjaro diabetes diabetic thyroid pregnant pregnancy breastfeeding period pcos depressed depression anxiety panic therapist therapy cancer surgery divorce girlfriend boyfriend wife husband salary debt').split(' '))

export function sensitivity(text: string): Sensitivity {
  const n = norm(text)
  if (CRISIS.test(n)) return 'crisis'
  if (EATING.test(n)) return 'eating'
  if (PRIVATE_PHRASES.test(n) || n.split(' ').some((w) => PRIVATE_WORDS.has(w))) return 'private'
  return 'ok'
}

