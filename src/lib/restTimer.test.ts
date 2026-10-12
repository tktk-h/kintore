import { describe, expect, it } from 'vitest'
import { adjustTimer, isTimerPaused, loadTimer, pauseTimer, remainingSec, resumeTimer, saveTimer, startTimer } from './restTimer'

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

describe('restTimer（一時停止）', () => {
  it('一時停止すると残り時間が止まり、再開するとそこから進む', () => {
    const t = startTimer(90, 0)
    const paused = pauseTimer(t, 30_000)
    expect(isTimerPaused(paused)).toBe(true)
    expect(remainingSec(paused, 30_000)).toBe(60)
    expect(remainingSec(paused, 500_000)).toBe(60)
    const resumed = resumeTimer(paused, 500_000)
    expect(isTimerPaused(resumed)).toBe(false)
    expect(resumed.endAt).toBe(560_000)
    expect(remainingSec(resumed, 510_000)).toBe(50)
  })

  it('一時停止中の増減は残り時間に足す', () => {
    const paused = pauseTimer(startTimer(90, 0), 30_000)
    expect(remainingSec(adjustTimer(paused, 15, 999_999), 999_999)).toBe(75)
    expect(remainingSec(adjustTimer(paused, -90, 999_999), 999_999)).toBe(0)
  })

  it('二度止めても、止めていないのに再開しても変わらない。終わったタイマーは止めない', () => {
    const t = startTimer(90, 0)
    const paused = pauseTimer(t, 30_000)
    expect(pauseTimer(paused, 60_000)).toEqual(paused)
    expect(resumeTimer(t, 10_000)).toEqual(t)
    expect(pauseTimer(t, 100_000)).toEqual(t)
  })

  it('一時停止中の状態も保存して読み戻せる', () => {
    const paused = pauseTimer(startTimer(90, 0), 30_000)
    saveTimer(paused)
    expect(loadTimer()).toEqual(paused)
  })
})
