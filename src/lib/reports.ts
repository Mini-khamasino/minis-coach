// Automatic error capture: deduplicated on phone, privacy-safe, uploaded when signed in.
import { db } from './db.ts'

/** Pure helper to compute dedupe key = message + first stack line. */
export function reportKey(message: string, stack?: string): string {
  const m = (message || '').trim()
  if (!stack) return m
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean)
  const firstStack = lines.find((l) => l !== m && !l.endsWith(m)) ?? lines[0] ?? ''
  return `${m}|${firstStack}`
}

export async function captureError(err: unknown, where = 'unknown'): Promise<string | undefined> {
  try {
    const message = err instanceof Error ? err.message : String(err || 'Unknown error')
    const stack = (err instanceof Error && err.stack ? err.stack : '').slice(0, 1000)
    const key = reportKey(message, stack)
    const now = Date.now()
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.0.0'
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

    const existing = await db.reports.get(key)
    if (existing) {
      await db.reports.update(key, {
        count: existing.count + 1,
        lastAt: now,
        sent: false,
      })
    } else {
      await db.reports.put({
        key,
        message: message.slice(0, 500),
        stack,
        version,
        tab: where,
        ua: ua.slice(0, 250),
        firstAt: now,
        lastAt: now,
        count: 1,
        sent: false,
      })
    }
    // keep the 50 most recent distinct errors; older ones were either sent or are stale
    const n = await db.reports.count()
    if (n > 50) await db.reports.bulkDelete((await db.reports.orderBy('lastAt').limit(n - 50).primaryKeys()) as string[])
    return key
  } catch (e) {
    console.warn('captureError failed', e)
  }
}
