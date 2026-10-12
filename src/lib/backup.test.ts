import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { getBodyLog, saveBodyLog } from '../repo/body'
import { createRoutine, listRoutines } from '../repo/routines'
import { saveSettings } from '../repo/settings'
import { resetDb } from '../test/db'
import { exportBackup, importBackup, parseBackup, shareOrDownload } from './backup'

beforeEach(resetDb)

describe('backup', () => {
  it('書き出したものを読み込むと元に戻る（写真も含む）', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    await saveSettings({ weightStep: 5 })
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

  it('メニューに sets がなければエラー', async () => {
    await createRoutine({ name: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [] }] })
    const backup = await exportBackup()
    const routines = (backup.data.routines as { exercises: { sets?: unknown }[] }[]).map((r) => ({
      ...r,
      exercises: r.exercises.map(({ sets: _sets, ...rest }) => rest),
    }))
    const broken = { ...backup, data: { ...backup.data, routines } }
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('バックアップファイルが壊れています（routines）')
  })

  it('新しいバージョンのバックアップは専用のメッセージ', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'kintore', version: 2, data: {} }))).toThrow(
      '新しいバージョンのアプリで作られたバックアップです',
    )
  })

  it('idが重複するファイルは読み込みに失敗し、今のデータは残る', async () => {
    const backup = await exportBackup()
    const dup = {
      id: 'dup', createdAt: 1, updatedAt: 1, deleted: false, name: 'x', exercises: [],
    }
    const bad = { ...backup, data: { ...backup.data, routines: [dup, dup] } }
    await createRoutine({ name: '残るはず', exercises: [] })
    await expect(importBackup(parseBackup(JSON.stringify(bad)))).rejects.toThrow()
    expect((await listRoutines()).map((r) => r.name)).toEqual(['残るはず'])
  })
})

describe('shareOrDownload', () => {
  const share = vi.fn()
  let click: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    share.mockReset()
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => {
    for (const k of ['canShare', 'share'] as const) delete (navigator as unknown as Record<string, unknown>)[k]
    vi.restoreAllMocks()
  })

  it('共有シートを閉じた（キャンセルした）ときは失敗にしない', async () => {
    share.mockRejectedValue(new DOMException('cancel', 'AbortError'))
    await expect(shareOrDownload('a.json', '{}')).resolves.toBeUndefined()
    expect(click).not.toHaveBeenCalled()
  })

  it('共有が許可されなかったときはダウンロードにする', async () => {
    share.mockRejectedValue(new DOMException('gesture', 'NotAllowedError'))
    await shareOrDownload('a.json', '{}')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('それ以外の失敗はそのまま投げる', async () => {
    share.mockRejectedValue(new Error('boom'))
    await expect(shareOrDownload('a.json', '{}')).rejects.toThrow('boom')
  })
})
