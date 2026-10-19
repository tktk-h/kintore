import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '../../test/user'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { assignRoutineToDate, getPlanForDate } from '../../repo/plans'
import { createRoutine } from '../../repo/routines'
import { finishWorkout, getActiveWorkout, getWorkoutDetail, startWorkout } from '../../repo/workouts'
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

  describe('始める前に予定の種目を直す', () => {
    const planToday = async () => {
      const r = await createRoutine({
        name: '胸の日',
        exercises: [
          { exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
          { exerciseId: 'ex-squat', restSec: 180, sets: [{ weight: 80, reps: 5 }] },
        ],
      })
      return assignRoutineToDate(r.id, TODAY)
    }

    it('セット数と重さを変えて保存すると予定が変わり、始めると新しい値で始まる', async () => {
      await planToday()
      open()
      await userEvent.click(await screen.findByRole('button', { name: /ベンチプレス.*8×2.*60kg/ }))
      const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
      await userEvent.click(within(sheet).getByRole('button', { name: 'セット数を増やす' }))
      await userEvent.click(within(sheet).getByRole('button', { name: '重さを増やす' }))
      expect(sheet).toHaveTextContent('8×3 ・ 62.5kg')
      await userEvent.click(within(sheet).getByRole('button', { name: '保存' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(await screen.findByRole('button', { name: /ベンチプレス.*8×3.*62.5kg/ })).toBeInTheDocument()
      expect((await getPlanForDate(TODAY))!.exercises[0].sets).toEqual([{ weight: 62.5, reps: 8 }, { weight: 62.5, reps: 8 }, { weight: 62.5, reps: 8 }])

      await userEvent.click(screen.getByRole('button', { name: '今日のトレーニングを始める' }))
      const active = await waitFor(async () => {
        const w = await getActiveWorkout()
        expect(w).toBeDefined()
        return w!
      })
      const detail = (await getWorkoutDetail(active.id))!
      expect(detail.exercises[0].sets.map((s) => [s.weight, s.reps])).toEqual([[62.5, 8], [62.5, 8], [62.5, 8]])
    })

    it('同じ動きのほかの種目に入れ替えられる', async () => {
      await planToday()
      open()
      await userEvent.click(await screen.findByRole('button', { name: /ベンチプレス/ }))
      const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
      await userEvent.click(within(sheet).getByRole('button', { name: '種目を入れ替える' }))
      const list = await within(sheet).findByRole('list', { name: '入れ替える種目' })
      expect(within(list).queryByRole('button', { name: /スクワット/ })).toBeNull()
      await userEvent.click(within(list).getByRole('button', { name: /^ダンベルプレス/ }))
      const swapped = await screen.findByRole('dialog', { name: 'ダンベルプレス' })
      // ベンチの60kgは引き継がず、記録がないのでダンベルプレスの初心者の目安（10kg）になる
      await waitFor(() => expect(swapped).toHaveTextContent('10kg'))
      await userEvent.click(within(swapped).getByRole('button', { name: '保存' }))
      await waitFor(async () => expect((await getPlanForDate(TODAY))!.exercises[0].exerciseId).toBe('ex-dumbbell-press'))
      expect((await getPlanForDate(TODAY))!.exercises[0].sets).toEqual([{ weight: 10, reps: 8 }, { weight: 10, reps: 8 }])
    })

    it('確認してから予定から外せる', async () => {
      await planToday()
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
      open()
      await userEvent.click(await screen.findByRole('button', { name: /ベンチプレス/ }))
      const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
      await userEvent.click(within(sheet).getByRole('button', { name: 'この種目を予定から外す' }))
      expect(confirm).toHaveBeenCalledWith('この種目を予定から外しますか？')
      await waitFor(async () => expect((await getPlanForDate(TODAY))!.exercises.map((e) => e.exerciseId)).toEqual(['ex-squat']))
      await waitFor(() => expect(screen.queryByRole('button', { name: /ベンチプレス/ })).toBeNull())
    })
  })
})
