import type { Meal } from './db.ts'

// Read once at load; switching language saves and reloads, so nothing else needs to re-render on change.
export const lang: 'ar' | 'en' = (() => {
  try { return localStorage.getItem('lang') === 'en' ? 'en' : 'ar' } catch { return 'ar' }
})()

/** Inline translation: Egyptian Arabic first, English second. */
export const L = (ar: string, en: string) => (lang === 'en' ? en : ar)

export const locale = lang === 'en' ? 'en-GB' : 'ar-EG'

export const MEAL_LABEL: Record<Meal, string> = {
  'فطار': L('فطار', 'Breakfast'),
  'غدا': L('غدا', 'Lunch'),
  'عشا': L('عشا', 'Dinner'),
  'سناك': L('سناك', 'Snack'),
}
