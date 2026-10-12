import { db } from '../db/db'
import type { BodyLog } from '../db/types'
import { newRecord } from '../lib/records'

export type BodyInput = Partial<Pick<BodyLog, 'weightKg' | 'bodyFatPct' | 'photo'>>

export async function getBodyLog(date: string): Promise<BodyLog | undefined> {
  return (await db.bodyLogs.where('date').equals(date).toArray()).find((b) => !b.deleted)
}

/** date 以前で、体重・体脂肪率それぞれの最新の値（入力欄の初期値に使う） */
export async function getLatestBodyValues(date: string): Promise<{ weightKg?: number; bodyFatPct?: number }> {
  const logs = (await db.bodyLogs.where('date').belowOrEqual(date).toArray())
    .filter((b) => !b.deleted)
    .sort((a, b) => b.date.localeCompare(a.date))
  return {
    weightKg: logs.find((b) => b.weightKg !== undefined)?.weightKg,
    bodyFatPct: logs.find((b) => b.bodyFatPct !== undefined)?.bodyFatPct,
  }
}

/** input に含めた項目だけ更新する（undefined を明示的に渡すとその項目を消す） */
export async function saveBodyLog(date: string, input: BodyInput): Promise<void> {
  const existing = await getBodyLog(date)
  if (existing) await db.bodyLogs.update(existing.id, { ...input, updatedAt: Date.now() })
  else await db.bodyLogs.add(newRecord<BodyLog>({ date, ...input }))
}

export async function listPhotoLogs(): Promise<BodyLog[]> {
  return (await db.bodyLogs.toArray())
    .filter((b) => !b.deleted && b.photo)
    .sort((a, b) => a.date.localeCompare(b.date))
}
