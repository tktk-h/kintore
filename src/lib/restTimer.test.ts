import { describe, expect, it } from 'vitest'
import { adjustTimer, loadTimer, remainingSec, saveTimer, startTimer } from './restTimer'

describe('restTimer', () => {
  it('開始直後は設定した秒数が残っている', () => {
    const t = startTimer(90, 1_000_000)
    expect(remainingSec(t, 1_000_000)).toBe(90)
  })

  it('経過時間を引き、端数は切り上げる', () => {
    const t = startTimer(90, 0)
    expect(remainingSec(t, 30_500)).toBe(60)
  })

  it('終了時刻を過ぎたら 0', () => {
    const t = startTimer(60, 0)
    expect(remainingSec(t, 120_000)).toBe(0)
  })

  it('adjustTimer で増減でき、現在より前には戻らない', () => {
    const t = startTimer(60, 0)
    expect(remainingSec(adjustTimer(t, 15, 0), 0)).toBe(75)
    expect(remainingSec(adjustTimer(t, -90, 0), 0)).toBe(0)
  })

  it('保存して読み戻せる（アプリを閉じても残り時間が正しい）', () => {
    const t = startTimer(90, 5000)
    saveTimer(t)
    expect(loadTimer()).toEqual(t)
    saveTimer(null)
    expect(loadTimer()).toBeNull()
  })

  it('壊れたデータは null', () => {
    localStorage.setItem('kintore.restTimer', '{broken')
    expect(loadTimer()).toBeNull()
  })
})
