import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { getBodyLog, saveBodyLog } from '../repo/body'
import { createRoutine, listRoutines } from '../repo/routines'
import { resetDb } from '../test/db'
import { exportBackup, importBackup, parseBackup } from './backup'

beforeEach(resetDb)

describe('backup', () => {
  it('書き出したものを読み込むと元に戻る（写真も含む）', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    await saveBodyLog('2026-10-12', { weightKg: 70, photo: 'data:image/jpeg;base64,AAA' })
    const text = JSON.stringify(await exportBackup())

    await resetDb()
    expect(await listRoutines()).toEqual([])

    await importBackup(parseBackup(text))
    expect((await listRoutines()).map((r) => r.name)).toEqual(['胸の日'])
    expect(await getBodyLog('2026-10-12')).toMatchObject({ weightKg: 70, photo: 'data:image/jpeg;base64,AAA' })
  })

  it('読み込むと今のデータは置き換わる', async () => {
    const text = JSON.stringify(await exportBackup())
    await createRoutine({ name: 'あとで作った', exercises: [] })
    await importBackup(parseBackup(text))
    expect(await listRoutines()).toEqual([])
  })

  it('JSONでなければエラー', () => {
    expect(() => parseBackup('not json')).toThrow('バックアップファイルを読み込めませんでした')
  })

  it('このアプリのファイルでなければエラー', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, data: {} }))).toThrow('このアプリのバックアップファイルではありません')
  })

  it('表が欠けていればエラーで、DBは変わらない', async () => {
    const backup = await exportBackup()
    const broken = { ...backup, data: { ...backup.data, sets: 'oops' } }
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('バックアップファイルが壊れています（sets）')
    expect(await db.exercises.count()).toBeGreaterThan(0)
  })
})
