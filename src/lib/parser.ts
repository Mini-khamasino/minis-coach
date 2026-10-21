import { FOODS, SERVING, ALIASES, type Macros } from './foods.ts'

/** Anything the parser can match: a table food or one of the person's own foods/recipes. */
export interface Candidate { key: string; name: string; per100: Macros; oily: boolean; foodId: string | null; serving?: [number, string, string] }

export interface ParsedLine {
  text: string
  /** the food words without numbers/units — the key for learning corrections */
  phrase: string
  match: Candidate | null
  alts: Candidate[]
  grams: number
  /** match strength: 100 exact name, 80 prefix, lower = partial */
  score: number
  /** w = grams were given (weighed), p = estimated from a portion/unit */
  acc: 'w' | 'p'
}

/** What the parser learned from the person: phrase → food, and their usual grams per food. */
export interface ParserMemory { phrases: Record<string, string>; portions: Record<string, number> }

export const norm = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
    .replace(/[ً-ْ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const NUMBER_WORDS: Record<string, number> = {
  واحد: 1, واحده: 1, one: 1, a: 1, an: 1, اتنين: 2, اثنين: 2, two: 2, تلاته: 3, ثلاثه: 3, ثلاث: 3, three: 3, اربعه: 4, اربع: 4, four: 4,
  خمسه: 5, خمس: 5, five: 5, سته: 6, ست: 6, six: 6, سبعه: 7, سبع: 7, seven: 7, تمنيه: 8, ثمانيه: 8, eight: 8, تسعه: 9, nine: 9, عشره: 10, ten: 10,
  نص: 0.5, نصف: 0.5, half: 0.5, ربع: 0.25, quarter: 0.25, تلت: 1 / 3, ثلث: 1 / 3,
}

// unit word → [grams per unit when the food has no own serving, does the food's own serving apply?]
const UNITS: [RegExp, number, boolean][] = [
  [/^(جرام|جم|ج|غرام|غ|g|gm|gr|gram|grams)$/, 1, false],
  [/^(كيلو|كجم|kg|kilo)$/, 1000, false],
  [/^(مل|ml|مللي)$/, 1, false],
  [/^(لتر|l|liter|litre)$/, 1000, false],
  [/^(معلقه صغيره|tsp|teaspoon)$/, 5, false],
  [/^(معلقه|معالق|ملعقه|tbsp|spoon|tablespoon)$/, 15, true],
  [/^(كوبايه|كوب|كاس|كوبايات|cup|glass|mug)$/, 240, true],
  [/^(طبق|اطباق|صحن|plate|bowl)$/, 300, true],
  [/^(فنجان|فناجين)$/, 60, true],
  [/^(سكوب|scoop)$/, 30, true],
  [/^(علبه|علب|كانز|can|tub|box)$/, 330, true],
  [/^(كيس|bag|pack|باكيت)$/, 30, true],
  [/^(رغيف|ارغفه|loaf)$/, 90, true],
  [/^(شريحه|شرايح|slice|slices)$/, 30, true],
  [/^(ساندويتش|ساندوتش|sandwich)$/, 220, true],
  [/^(حبه|حبايه|حبات|قطعه|قطع|حته|حتت|piece|pieces|pc|pcs)$/, 100, true],
]

const unitOf = (w: string) => UNITS.find(([re]) => re.test(w))
const numOf = (w: string): number | null => (/^\d+(\.\d+)?$/.test(w) ? Number(w) : NUMBER_WORDS[w] ?? null)

/** Arabic dual: "رغيفين", "بيضتين" → [stem, 2] */
function dual(w: string): [string, number] | null {
  if (w.length < 5) return null
  if (w.endsWith('تين')) return [w.slice(0, -3) + 'ه', 2]
  if (w.endsWith('ين')) return [w.slice(0, -2), 2]
  return null
}

/** Split "2 بيض ورغيف بلدي، وكوباية شاي" into one chunk per food. */
export function segments(text: string): string[] {
  const parts = text.split(/[,،+\n؛;]| and | & | مع /i)
  const out: string[] = []
  for (const part of parts) {
    let cur: string[] = []
    for (const w of norm(part).split(' ').filter(Boolean)) {
      // a word glued to "و" that starts something new ("ورغيف", "و2") begins a new chunk
      const rest = w.slice(1)
      const startsNew = w.length > 2 && w.startsWith('و') && cur.length > 0 && (numOf(rest) !== null || unitOf(rest) || knownWord(rest))
      if (w === 'و' && cur.length) { out.push(cur.join(' ')); cur = []; continue }
      if (startsNew) { out.push(cur.join(' ')); cur = [rest]; continue }
      cur.push(w)
    }
    if (cur.length) out.push(cur.join(' '))
  }
  return out.filter((s) => s.trim())
}

const toCandidate = (f: (typeof FOODS)[string]): Candidate => ({ key: f.id, name: f.name, per100: { kcal: f.kcal, p: f.p, c: f.c, f: f.f }, oily: f.oily, foodId: f.id, serving: SERVING[f.id] })
const ALL_TABLE: Candidate[] = Object.values(FOODS).filter((f) => !f.raw).map(toCandidate)
const RAW: Candidate[] = Object.values(FOODS).filter((f) => f.raw).map(toCandidate)

/** The person's own foods and recipes as parser candidates. */
export const customCandidates = (customs: { name: string; per100: Macros }[]): Candidate[] =>
  customs.map((c) => ({ key: `u:${c.name}`, name: c.name, per100: c.per100, oily: false, foodId: null }))

const NAMES = new Map<string, string[]>(
  Object.values(FOODS).map((f) => [f.id, [f.ar, f.en, ...(ALIASES[f.id] ?? [])].map(norm)]),
)
const VOCAB = new Set([...NAMES.values()].flat().flatMap((n) => n.split(' ')).filter((w) => w.length > 2))
const knownWord = (w: string) => VOCAB.has(w) || [...VOCAB].some((v) => v.startsWith(w) && w.length > 3)

/** How well a phrase names a candidate: 100 exact, 80 prefix, 40–70 all words, lower for partial. */
function score(phrase: string, names: string[]): number {
  let best = 0
  const words = phrase.split(' ')
  for (const n of names) {
    if (n === phrase) return 100
    if (n.startsWith(phrase + ' ') || n.startsWith(phrase)) best = Math.max(best, 80)
    const nw = n.split(' ')
    // prefix both ways: "بيض" finds "بيضه", "تمرات" finds "تمر"
    const hits = words.filter((w) => nw.some((x) => x === w || (w.length > 2 && x.startsWith(w)) || (x.length > 2 && w.startsWith(x)))).length
    if (hits === words.length) best = Math.max(best, 70 - Math.min(30, nw.length * 3))
    else if (hits) best = Math.max(best, (30 * hits) / words.length)
  }
  return best
}

export function parseLine(text: string, customs: Candidate[], mem: ParserMemory): ParsedLine {
  let qty: number | null = null
  let grams: number | null = null
  let unit: [RegExp, number, boolean] | undefined
  let unitWord = ''
  const rest: string[] = []
  const words = text.split(' ')
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const two = i + 1 < words.length ? `${w} ${words[i + 1]}` : ''
    const n = numOf(w)
    if (n !== null) {
      const u = unitOf(words[i + 1] ?? '')
      if (u && u[2] === false) { grams = n * u[1]; i++; continue } // "200 جرام", "1 كيلو"
      qty = (qty ?? 1) * n
      continue
    }
    const gramsGlued = w.match(/^(\d+(?:\.\d+)?)(g|gm|ml|ج|جم)$/)
    if (gramsGlued) { grams = Number(gramsGlued[1]); continue }
    if (two && unitOf(two)) { unit = unitOf(two); unitWord = two; i++; continue }
    const u = unitOf(w)
    if (u && u[2]) { unit = u; unitWord = w; continue }
    const d = dual(w)
    const stem = d && [d[0], d[0].replace(/ه$/, '')].find((x) => unitOf(x) || knownWord(x))
    if (d && stem) {
      qty = (qty ?? 1) * d[1]
      if (unitOf(stem)) { unit = unitOf(stem); unitWord = stem } else rest.push(stem)
      continue
    }
    rest.push(w)
  }
  // "رغيفين" alone: the unit word is also the food
  const phrase = rest.join(' ') || unitWord

  const pool = [...customs, ...ALL_TABLE]
  const remembered = mem.phrases[phrase]
  const ranked = pool
    .map((c) => ({ c, s: (c.key === remembered ? 200 : 0) + score(phrase, c.foodId ? NAMES.get(c.foodId) ?? [norm(c.name)] : [norm(c.name)]) + (c.foodId ? 0 : 5) }))
    .filter((x) => x.s >= 20)
    .sort((a, b) => b.s - a.s)
  const match = ranked[0]?.c ?? null

  const serving = match?.serving?.[0]
  let g: number
  let acc: 'w' | 'p' = 'p'
  if (grams !== null) { g = grams; acc = 'w' }
  else if (unit) {
    // "معلقة عسل" uses honey's own spoon (20 g), not the generic 15 g; works for the Arabic or English unit name
    const sameUnit = unit[2] && match?.serving && [match.serving[1], match.serving[2]].some((u) => norm(u).startsWith(unitWord.slice(0, 3)))
    g = (sameUnit ? serving! : unit[1]) * (qty ?? 1)
  }
  else if (qty !== null) g = (serving ?? 100) * qty
  else g = (match && mem.portions[match.key]) || serving || 100

  return { text, phrase, match, alts: ranked.slice(1, 5).map((x) => x.c), grams: Math.round(g), score: ranked[0]?.s ?? 0, acc }
}

/** Plain search for pickers. `raw` puts raw ingredients first (recipe builder). */
export function search(q: string, customs: Candidate[], raw = false, limit = 8): Candidate[] {
  const phrase = norm(q)
  if (phrase.length < 2) return []
  const pool = raw ? [...RAW, ...customs, ...ALL_TABLE] : [...customs, ...ALL_TABLE]
  return pool
    .map((c, i) => ({ c, s: score(phrase, c.foodId ? NAMES.get(c.foodId) ?? [norm(c.name)] : [norm(c.name)]) - i / 1e4 }))
    .filter((x) => x.s >= 20)
    .map((x) => (raw && RAW.includes(x.c) ? { ...x, s: x.s + 40 } : x)) // recipes start from raw ingredients
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c)
}

export const parse = (text: string, customs: Candidate[], mem: ParserMemory) => segments(text).map((s) => parseLine(s, customs, mem))
