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
}
export interface Water { id?: number; date: string; ml: number; ts: number }
export interface Weight { date: string; kg: number }
export interface Chat { id?: number; date: string; ts: number; role: 'user' | 'coach'; text: string; logged?: string }
export interface Note { id?: number; text: string; ts: number }
export interface CustomFood { name: string; per100: Macros }
interface KV { key: string; value: unknown }

export const db = new Dexie('minis-coach') as Dexie & {
  items: EntityTable<Item, 'id'>
  water: EntityTable<Water, 'id'>
  weights: EntityTable<Weight, 'date'>
  chat: EntityTable<Chat, 'id'>
  notes: EntityTable<Note, 'id'>
  customFoods: EntityTable<CustomFood, 'name'>
  kv: EntityTable<KV, 'key'>
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

export const today = () => new Date().toLocaleDateString('en-CA')

export interface Settings {
  apiKey: string
  model: string
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
  apiKey: '',
  model: 'gemini-flash-lite-latest',
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
