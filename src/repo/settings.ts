import { db } from '../db/db'
import { DEFAULT_SETTINGS, type Settings } from '../db/types'

export async function getSettings(): Promise<Settings> {
  // 後から追加した項目（dumbbellStep）がない古い設定は既定値で補う
  return { ...DEFAULT_SETTINGS, ...(await db.settings.get('app')) }
}

export async function saveSettings(changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...changes, id: 'app' })
}
