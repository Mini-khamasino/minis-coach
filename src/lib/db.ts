import Dexie, { type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Macros } from './foods.ts'
import { compute } from './calc.ts'

export type Meal = 'فطار' | 'غدا' | 'عشا' | 'سناك'
export const MEALS: Meal[] = ['فطار', 'غدا', 'عشا', 'سناك']

export interface Item extends Macros {
  id?: number
  date: string
  ts: number
  meal: Meal
  name: string
  foodId: string | null
  grams: number
  per100: Macros
  margin: boolean
  estimated: boolean
  /** w = weighed grams, p = estimated portion, l = from a label/menu */
  acc?: 'w' | 'p' | 'l'
  /** per100 holds per-serving values (menu/label entry); grams = servings × 100 */
  perServing?: boolean
}
export interface Water { id?: number; date: string; ml: number; ts: number }
export interface Weight { date: string; kg: number }
export interface Chat { id?: number; date: string; ts: number; role: 'user' | 'coach'; text: string; logged?: string }
export interface Note { id?: number; text: string; ts: number }
export interface RecipeIngredient { foodId: string; name: string; grams: number }
export interface CustomFood { name: string; per100: Macros; recipe?: { ingredients: RecipeIngredient[]; cookedGrams: number } }
export interface MealItem { name: string; foodId: string | null; per100: Macros; grams: number; margin: boolean; perServing?: boolean }
export interface SavedMeal { id?: number; name: string; items: MealItem[] }
interface KV { key: string; value: unknown }

export const db = new Dexie('minis-coach') as Dexie & {
  items: EntityTable<Item, 'id'>
  water: EntityTable<Water, 'id'>
  weights: EntityTable<Weight, 'date'>
  chat: EntityTable<Chat, 'id'>
  notes: EntityTable<Note, 'id'>
  customFoods: EntityTable<CustomFood, 'name'>
  kv: EntityTable<KV, 'key'>
  meals: EntityTable<SavedMeal, 'id'>
}
db.version(1).stores({
  items: '++id, date',
  water: '++id, date',
  weights: 'date',
  chat: '++id, date',
  notes: '++id',
  customFoods: 'name',
  kv: 'key',
})
db.version(2).stores({ meals: '++id' })

export const today = () => new Date().toLocaleDateString('en-CA')

export type Sex = 'm' | 'f'
export type GoalType = 'cut' | 'maintain' | 'bulk'
export const ACCENTS = ['blue', 'green', 'purple', 'pink', 'orange', 'teal', 'red', 'graphite'] as const
export type Accent = (typeof ACCENTS)[number]

export interface Settings {
  onboarded: boolean
  name: string
  sex: Sex
  activity: number
  goalType: GoalType
  trainDays: number
  lang: 'ar' | 'en'
  accent: Accent
  goal: number
  protein: number
  greenMax: number
  amberMax: number
  maintenance: number
  waterGoal: number
  targetKg: number
  ratePerWeek: number
  startDate: string
  startKg: number
  heightCm: number
  age: number
  lastBackup: number | null
  theme: 'system' | 'dark' | 'light'
}
export const DEFAULTS: Settings = {
  onboarded: false,
  name: '',
  sex: 'm',
  activity: 1.2,
  goalType: 'cut',
  trainDays: 3,
  lang: 'ar',
  accent: 'blue',
  goal: 1750,
  protein: 130,
  greenMax: 1850,
  amberMax: 2500,
  maintenance: 2500,
  waterGoal: 3000,
  targetKg: 85,
  ratePerWeek: 0.75,
  startDate: '2026-10-17',
  startKg: 115,
  heightCm: 177,
  age: 21,
  lastBackup: null,
  theme: 'system',
}

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULTS, ...(row?.value as Partial<Settings>) }
}
export async function saveSettings(patch: Partial<Settings>) {
  await db.kv.put({ key: 'settings', value: { ...(await getSettings()), ...patch } })
}
export function useSettings(): Settings {
  return useLiveQuery(getSettings) ?? DEFAULTS
}

export function makeItem(date: string, meal: Meal, name: string, foodId: string | null, grams: number, per100: Macros, margin: boolean, estimated: boolean): Item {
  return { date, ts: Date.now(), meal, name, foodId, grams, per100, margin, estimated, ...compute(per100, grams, margin) }
}
