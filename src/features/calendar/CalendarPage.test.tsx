import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import userEvent from '../../test/user'
import { CalendarPage } from './CalendarPage'

beforeEach(async () => {
  await resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T09:00:00'))
})
afterEach(() => vi.useRealTimers())

const open = () => renderPage('/calendar', '/calendar', <CalendarPage />)

describe('CalendarPage', () => {
  it('6か月前から3か月先まで縦に並べ、「今日」ボタンを出す', async () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    open()
    const months = screen.getAllByRole('region')
    expect(months).toHaveLength(10)
    expect(months[0]).toHaveAccessibleName('2026年4月')
    expect(months[9]).toHaveAccessibleName('2027年1月')
    expect(within(screen.getByRole('region', { name: '2026年10月' })).getByRole('button', { current: 'date' })).toHaveAccessibleName('10月20日(火) 今日')
    expect(scrolled).toHaveBeenCalledTimes(1)
    expect(scrolled.mock.contexts[0]).toBe(screen.getByRole('region', { name: '2026年10月' }))
    await userEvent.click(screen.getByRole('button', { name: '今日' }))
    expect(scrolled).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument()
  })

  it('記録した部位を読み上げ名に入れ、日付を押すとその日の画面へ', async () => {
    await startWorkout({ date: '2026-09-03', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [] }] })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '9月3日(木) 胸' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/day/2026-09-03')
  })
})
