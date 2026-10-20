import { db, getSettings, saveSettings, today } from './db.ts'

const TABLES = ['items', 'water', 'weights', 'chat', 'notes', 'customFoods', 'kv'] as const

/** Build the backup ahead of the tap: Android only allows share() right after a user gesture. */
export async function prepareBackup(): Promise<File> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  data.kv = (data.kv as { key: string; value: Record<string, unknown> }[]).map((r) =>
    r.key === 'settings' ? { ...r, value: { ...r.value, apiKey: '' } } : r,
  )
  const json = JSON.stringify({ app: 'minis-coach', version: 1, exportedAt: new Date().toISOString(), data })
  const base = `minis-coach-${today()}`
  // Chrome Android only shares allow-listed types; .json is not one, so fall back to .txt (same JSON inside).
  const json_ = new File([json], `${base}.json`, { type: 'application/json' })
  return navigator.canShare?.({ files: [json_] }) ? json_ : new File([json], `${base}.txt`, { type: 'text/plain' })
}

/** Share sheet → Google Drive; download if sharing isn't allowed. The API key never leaves the phone. */
export async function backup(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Mini's Coach backup" })
      await saveSettings({ lastBackup: Date.now() })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // NotAllowedError etc. → fall through to a plain download
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
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
