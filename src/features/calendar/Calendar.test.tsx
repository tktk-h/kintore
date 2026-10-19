import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assignRoutineToDate } from '../../repo/plans'
import { createRoutine } from '../../repo/routines'
import { finishWorkout, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import userEvent from '../../test/user'
import { Calendar } from './Calendar'

beforeEach(async () => {
  await resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T09:00:00'))
})
afterEach(() => vi.useRealTimers())

const open = () => renderPage('/', '/', <Calendar />)

describe('Calendar（ホーム）', () => {
  it('部位ごとに色を分けた棒を日付の下に出す', async () => {
    const first = await startWorkout({
      date: '2026-10-12',
      exercises: [
        { exerciseId: 'ex-bench-press', restSec: 90, sets: [] },
        { exerciseId: 'ex-lat-pulldown', restSec: 90, sets: [] },
      ],
    })
    await finishWorkout(first, {})
    await startWorkout({ date: '2026-10-13', exercises: [{ exerciseId: 'ex-squat', restSec: 90, sets: [] }] })
    open()
    const both = await screen.findByRole('button', { name: '10月12日(月) 胸・背中' })
    expect([...both.querySelectorAll('.cal-seg')].map((s) => s.getAttribute('data-part'))).toEqual(['chest', 'back'])
    expect(both.querySelector('.cal-ind.is-pill')).not.toBeNull()
    const one = screen.getByRole('button', { name: '10月13日(火) 脚' })
    expect(one.querySelector('.cal-ind.is-dot')).not.toBeNull()
    expect(one.querySelectorAll('.cal-seg')).toHaveLength(1)
  })

  it('予定だけの日は中が空の印にする', async () => {
    const r = await createRoutine({ name: '脚の日', exercises: [] })
    await assignRoutineToDate(r.id, '2026-10-22')
    open()
    const day = await screen.findByRole('button', { name: '10月22日(木) 予定あり' })
    expect(day.querySelector('.cal-ind.is-plan')).not.toBeNull()
    expect(day.querySelectorAll('.cal-seg')).toHaveLength(0)
  })

  it('今日に印をつけ、矢印で月を移れる', async () => {
    open()
    const today = await screen.findByRole('button', { name: '10月20日(火) 今日' })
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(screen.getAllByRole('button', { current: 'date' })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '10月2026年' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    expect(screen.getByRole('heading', { name: '11月2026年' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { current: 'date' })).toBeNull()
  })

  it('色の見方は押したときだけ出し、「すべて見る」でカレンダー画面へ', async () => {
    open()
    expect(screen.queryByText('有酸素')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '色の見方' }))
    expect(screen.getByText('有酸素')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'すべて見る' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/calendar')
  })

  it('日付を押すとその日の画面へ', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: /^10月5日\(月\)/ }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/day/2026-10-05')
  })
})
