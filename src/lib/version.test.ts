import { describe, expect, it } from 'vitest'
import { APP_VERSION, BUILD_TIME, formatBuildTime, formatBuildTimeShort, versionLine } from './version'

const iso = new Date(2026, 9, 13, 14, 5).toISOString()

describe('version', () => {
  it('ビルドの値が入っている（テストでも define が効く）', () => {
    expect(APP_VERSION).toBe('0.2.0')
    expect(Number.isNaN(Date.parse(BUILD_TIME))).toBe(false)
  })

  it('更新日時を日本の書き方で出す', () => {
    expect(formatBuildTime(iso)).toBe('2026/10/13 14:05')
    expect(formatBuildTimeShort(iso)).toBe('10/13 14:05')
  })

  it('ホームの下に出す1行', () => {
    expect(versionLine('0.2.0', iso)).toBe('v0.2.0 ・ 10/13 14:05 更新')
  })

  it('日時が読めなければ空にする', () => {
    expect(formatBuildTime('broken')).toBe('')
    expect(versionLine('0.2.0', 'broken')).toBe('v0.2.0')
  })
})
