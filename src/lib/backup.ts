import { db, getSettings, saveSettings, today } from './db.ts'

const TABLES = ['items', 'water', 'weights', 'chat', 'notes', 'customFoods', 'kv'] as const

/** Share sheet → Google Drive. The API key never leaves the phone. */
export async function backup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  data.kv = (data.kv as { key: string; value: Record<string, unknown> }[]).map((r) =>
    r.key === 'settings' ? { ...r, value: { ...r.value, apiKey: '' } } : r,
  )
  const json = JSON.stringify({ app: 'minis-coach', version: 1, exportedAt: new Date().toISOString(), data })
  const base = `minis-coach-${today()}`

  // Chrome Android only shares allow-listed types; .json is not one, so fall back to .txt (same JSON inside).
  for (const [ext, type] of [['json', 'application/json'], ['txt', 'text/plain']] as const) {
    const file = new File([json], `${base}.${ext}`, { type })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Mini's Coach backup" })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'cancelled'
        throw e
      }
      await saveSettings({ lastBackup: Date.now() })
      return 'shared'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  a.download = `${base}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  await saveSettings({ lastBackup: Date.now() })
  return 'downloaded'
}

export async function restore(file: File) {
  const parsed = JSON.parse(await file.text())
  if (parsed?.app !== 'minis-coach' || typeof parsed.data !== 'object') throw new Error('الملف ده مش باك أب من Mini\'s Coach')
  for (const t of TABLES) if (!Array.isArray(parsed.data[t])) throw new Error(`الملف ناقص: ${t}`)
  const keepKey = (await getSettings()).apiKey
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      await db.table(t).bulkAdd(parsed.data[t])
    }
  })
  await saveSettings({ apiKey: keepKey })
}

export const daysSinceBackup = (last: number | null) => (last ? Math.floor((Date.now() - last) / 86_400_000) : null)
