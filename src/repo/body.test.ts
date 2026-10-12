import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { resetDb } from '../test/db'
import { getBodyLog, getLatestBodyValues, listPhotoLogs, saveBodyLog } from './body'

beforeEach(resetDb)

describe('body', () => {
  it('同時に保存しても同じ日の記録は1件だけ', async () => {
    await Promise.all([saveBodyLog('2026-10-12', { weightKg: 70 }), saveBodyLog('2026-10-12', { bodyFatPct: 18 })])
    const rows = (await db.bodyLogs.where('date').equals('2026-10-12').toArray()).filter((b) => !b.deleted)
    expect(rows).toHaveLength(1)
  })

  it('同じ日に保存すると上書きする', async () => {
    await saveBodyLog('2026-10-12', { weightKg: 70 })
    await saveBodyLog('2026-10-12', { weightKg: 69.8 })
    expect((await getBodyLog('2026-10-12'))?.weightKg).toBe(69.8)
  })

  it('体重だけ保存しても写真は消えない', async () => {
    await saveBodyLog('2026-10-12', { weightKg: 70, photo: 'data:image/jpeg;base64,AAA' })
    await saveBodyLog('2026-10-12', { weightKg: 69.5 })
    expect(await getBodyLog('2026-10-12')).toMatchObject({ weightKg: 69.5, photo: 'data:image/jpeg;base64,AAA' })
  })

  it('最新の体重と体脂肪率を、それぞれ記録がある日から取る', async () => {
    await saveBodyLog('2026-10-01', { weightKg: 71, bodyFatPct: 18 })
    await saveBodyLog('2026-10-05', { weightKg: 70 })
    await saveBodyLog('2026-10-20', { weightKg: 68 })
    expect(await getLatestBodyValues('2026-10-12')).toEqual({ weightKg: 70, bodyFatPct: 18 })
  })

  it('写真がある記録を日付順に返す', async () => {
    await saveBodyLog('2026-10-05', { photo: 'b' })
    await saveBodyLog('2026-10-01', { photo: 'a' })
    await saveBodyLog('2026-10-03', { weightKg: 70 })
    expect((await listPhotoLogs()).map((l) => l.date)).toEqual(['2026-10-01', '2026-10-05'])
  })
})
