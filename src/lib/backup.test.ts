import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { getBodyLog, saveBodyLog } from '../repo/body'
import { createRoutine, listRoutines } from '../repo/routines'
import { addChatMessage, listChatMessages } from '../repo/chat'
import { getProfile, saveProfile } from '../repo/profile'
import { getSettings, saveSettings } from '../repo/settings'
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

  it('一時停止の項目があってもなくても読み込める', async () => {
    const backup = await exportBackup()
    const base = { id: 'w', createdAt: 0, updatedAt: 0, deleted: false, date: '2026-10-12', startedAt: 0 }
    backup.data.workouts = [base, { ...base, id: 'w2', pausedAt: 10, pausedMs: 5000 }]
    expect(parseBackup(JSON.stringify(backup)).data.workouts).toHaveLength(2)
  })

  it('プロフィールとチャットも書き出して戻せる', async () => {
    await saveProfile({
      goal: 'strength', experience: 'over_3y', daysPerWeek: 3, minutesPerSession: 90,
      weekdays: [1, 3, 5], equipment: ['gym_free'], injuries: '腰', baselines: [],
    })
    await addChatMessage({ role: 'user', text: '来週のメニューを作って' })
    await saveSettings({ coachPasscode: 'secret' })
    const text = JSON.stringify(await exportBackup())

    await resetDb()
    await importBackup(parseBackup(text))
    expect(await getProfile()).toMatchObject({ goal: 'strength', injuries: '腰' })
    expect((await listChatMessages()).map((m) => m.text)).toEqual(['来週のメニューを作って'])
    expect(await getSettings()).toMatchObject({ coachPasscode: 'secret' })
  })

  it('プロフィールとチャットの表がない古いバックアップも読み込める', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    const backup = await exportBackup()
    const { profile: _p, chatMessages: _c, ...oldData } = backup.data
    const text = JSON.stringify({ ...backup, data: oldData })

    await saveProfile({
      goal: 'health', experience: 'none', daysPerWeek: 2, minutesPerSession: 30,
      weekdays: [], equipment: ['bodyweight'], injuries: '', baselines: [],
    })
    await addChatMessage({ role: 'user', text: '消える' })
    const file = parseBackup(text)
    expect(file.data.profile).toEqual([])
    expect(file.data.chatMessages).toEqual([])
    await importBackup(file)
    expect((await listRoutines()).map((r) => r.name)).toEqual(['胸の日'])
    expect(await getProfile()).toBeUndefined()
    expect(await listChatMessages()).toEqual([])
  })

  it('種目に動きの種類がない古いバックアップを読み込むと、定番種目に情報が足される（自作種目はそのまま）', async () => {
    const backup = await exportBackup()
    const v1 = (backup.data.exercises as Record<string, unknown>[]).map(
      ({ pattern: _p, primary: _pr, secondary: _s, compound: _c, ...rest }) => rest,
    )
    const custom = {
      id: 'my-ex', name: '自作', bodyPart: 'chest', equipment: 'other', logType: 'reps', defaultRestSec: 60,
      custom: true, createdAt: 0, updatedAt: 0, deleted: false,
    }
    const text = JSON.stringify({ ...backup, data: { ...backup.data, exercises: [...v1, custom] } })

    await importBackup(parseBackup(text))
    expect(await db.exercises.get('ex-bench-press')).toMatchObject({ pattern: 'horizontal_push', primary: ['chest'], compound: true })
    expect((await db.exercises.get('my-ex'))?.pattern).toBeUndefined()
  })

  it('チャットの形がおかしければエラー', async () => {
    const backup = await exportBackup()
    const broken = { ...backup, data: { ...backup.data, chatMessages: [{ id: 'c', deleted: false, role: 'robot', text: 'x', createdAt: 0, updatedAt: 0 }] } }
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('バックアップファイルが壊れています（chatMessages）')
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
