import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { assignRoutineToDate } from '../../repo/plans'
import { createRoutine } from '../../repo/routines'
import { finishWorkout, getActiveWorkout, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { TodayWorkoutCard } from './TodayWorkoutCard'

const TODAY = '2026-10-12'
const open = () => renderPage('/', '/', <TodayWorkoutCard date={TODAY} />)

beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())

describe('TodayWorkoutCard', () => {
  it('予定があれば「今日のトレーニングを始める」で予定どおり始まる', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    await assignRoutineToDate(r.id, TODAY)
    open()
    expect(await screen.findByText('ベンチプレス')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '今日のトレーニングを始める' }))
    const active = await waitFor(async () => {
      const w = await getActiveWorkout()
      expect(w).toBeDefined()
      return w!
    })
    expect(active.title).toBe('胸の日')
    expect(await screen.findByTestId('current-path')).toHaveTextContent(`/workout/${active.id}`)
  })

  it('予定がなければ開始方法を選べる', async () => {
    open()
    expect(await screen.findByRole('button', { name: '空から始める' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'マイメニューから選ぶ' })).toBeInTheDocument()
  })

  it('開始ボタンを連打しても1つしか始まらない', async () => {
    open()
    await userEvent.dblClick(await screen.findByRole('button', { name: '空から始める' }))
    const active = await waitFor(async () => {
      const w = await getActiveWorkout()
      expect(w).toBeDefined()
      return w!
    })
    expect(await screen.findByTestId('current-path')).toHaveTextContent(`/workout/${active.id}`)
    expect(await db.workouts.count()).toBe(1)
  })

  it('トレーニング中なら進み具合と「続ける」を出す', async () => {
    const id = await startWorkout({ date: TODAY, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    open()
    expect(await screen.findByText('0/1種目')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent(`/workout/${id}`)
  })

  it('トレーニング中は一時停止・再開できる', async () => {
    const id = await startWorkout({ date: TODAY, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '一時停止' }))
    expect(await screen.findByRole('button', { name: '再開' })).toBeInTheDocument()
    expect(screen.getByText('一時停止中')).toBeInTheDocument()
    expect((await db.workouts.get(id))!.pausedAt).toEqual(expect.any(Number))
    await userEvent.click(screen.getByRole('button', { name: '再開' }))
    expect(await screen.findByRole('button', { name: '一時停止' })).toBeInTheDocument()
    expect(screen.queryByText('一時停止中')).toBeNull()
    expect((await db.workouts.get(id))!.pausedAt).toBeUndefined()
  })

  it('キャンセルは確認してから記録ごと取り消す', async () => {
    await startWorkout({ date: TODAY, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(confirm).toHaveBeenCalledWith('このトレーニングを取り消しますか？記録したセットも消えます')
    expect(await getActiveWorkout()).toBeDefined()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(await screen.findByRole('button', { name: '空から始める' })).toBeInTheDocument()
    expect(await getActiveWorkout()).toBeUndefined()
  })

  it('終わったらまとめを出す', async () => {
    const id = await startWorkout({ date: TODAY, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    const set = (await db.sets.where('workoutId').equals(id).first())!
    await db.sets.update(set.id, { done: true })
    await finishWorkout(id, {})
    open()
    expect(await screen.findByText('総重量 480kg')).toBeInTheDocument()
  })
})
