import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getWorkoutDetail, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { WorkoutPage } from './WorkoutPage'

let workoutId: string

beforeEach(async () => {
  await resetDb()
  workoutId = await startWorkout({
    date: '2026-10-12',
    title: '胸の日',
    exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }],
  })
})

const open = () => renderPage('/workout/:id', `/workout/${workoutId}`, <WorkoutPage />)

describe('WorkoutPage', () => {
  it('予定の重量・回数が最初から入っている', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'ベンチプレス' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '重量 60kg' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '回数 8回' })).toHaveLength(2)
  })

  it('チェックすると記録され、休憩タイマーが始まる', async () => {
    open()
    await userEvent.click(await screen.findByRole('checkbox', { name: '1セット目 完了' }))
    await waitFor(async () => expect((await getWorkoutDetail(workoutId))!.exercises[0].sets[0].done).toBe(true))
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')
  })

  it('＋で回数を変えられる', async () => {
    open()
    await userEvent.click((await screen.findAllByRole('button', { name: '回数を増やす' }))[0])
    await waitFor(async () => expect((await getWorkoutDetail(workoutId))!.exercises[0].sets[0].reps).toBe(9))
  })

  it('セットを追加できる', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: '＋ セット追加' }))
    expect(await screen.findByRole('checkbox', { name: '3セット目 完了' })).toBeInTheDocument()
  })

  it('終了すると調子・満足度を保存してホームへ戻る', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'トレーニング終了' }))
    await userEvent.click(screen.getByRole('button', { name: '調子 4' }))
    await userEvent.click(screen.getByRole('button', { name: '満足度 5' }))
    await userEvent.click(screen.getByRole('button', { name: '終了する' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/')
    expect((await getWorkoutDetail(workoutId))!.workout).toMatchObject({ condition: 4, satisfaction: 5, finishedAt: expect.any(Number) })
  })
})
