import { describe, expect, it } from 'vitest'
import { formatDateJa, formatDuration, monthGrid, monthRange, parseDateKey, toDateKey } from './dates'

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
