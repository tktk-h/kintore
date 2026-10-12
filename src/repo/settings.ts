import { db } from '../db/db'
import { DEFAULT_SETTINGS, type Settings } from '../db/types'

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...changes, id: 'app' })
}
