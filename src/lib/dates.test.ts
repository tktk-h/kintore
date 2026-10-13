import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, formatDateJa, formatDuration, mondayOf, monthGrid, monthRange, parseDateKey, toDateKey } from './dates'

describe('dates', () => {
  it('toDateKey はローカル日付を YYYY-MM-DD にする', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('parseDateKey は toDateKey の逆', () => {
    expect(toDateKey(parseDateKey('2026-10-12'))).toBe('2026-10-12')
  })

  it('formatDateJa は曜日つきで表示する', () => {
    expect(formatDateJa('2026-10-12')).toBe('10月12日(月)')
  })

  it('monthGrid は日曜始まりの週ごとに並べる', () => {
    const weeks = monthGrid(2026, 9) // 2026年10月（1日は木曜）
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(weeks[4][6]).toBe('2026-10-31')
  })

  it('monthRange は月の初日と最終日', () => {
    expect(monthRange(2026, 1)).toEqual(['2026-02-01', '2026-02-28'])
  })

  it('formatDuration は分・時間で表示する', () => {
    expect(formatDuration(42 * 60000)).toBe('42分')
    expect(formatDuration(95 * 60000)).toBe('1時間35分')
  })
})

describe('dates（週の計算）', () => {
  it('addDays は月・年をまたいで日を足す', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('daysBetween は日数の差', () => {
    expect(daysBetween('2026-10-12', '2026-10-14')).toBe(2)
    expect(daysBetween('2026-10-14', '2026-10-12')).toBe(-2)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('mondayOf はその週の月曜（日曜は前の週）', () => {
    expect(mondayOf('2026-10-12')).toBe('2026-10-12')
    expect(mondayOf('2026-10-15')).toBe('2026-10-12')
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
  })
})
