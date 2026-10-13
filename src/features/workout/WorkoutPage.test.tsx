import { screen, waitFor } from '@testing-library/react'
import userEvent from '../../test/user'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTimer, saveTimer, startTimer } from '../../lib/restTimer'
import { db } from '../../db/db'
import { finishWorkout, getActiveWorkout, getWorkoutDetail, startWorkout } from '../../repo/workouts'
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

afterEach(() => vi.restoreAllMocks())

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
    expect(screen.getByRole('timer')).toHaveTextContent(/1:(30|29)/) // 負荷で1秒進むことがある
  })

  it('種目のカードをたたむと、セット数のまとめだけ出す（開き直しても覚えている）', async () => {
    const { unmount } = open()
    await userEvent.click(await screen.findByRole('button', { name: '「ベンチプレス」をたたむ' }))
    expect(screen.queryByRole('checkbox', { name: '1セット目 完了' })).toBeNull()
    expect(screen.getByText('0/2セット')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ベンチプレス' })).toBeInTheDocument()
    unmount()
    open()
    expect(await screen.findByRole('button', { name: '「ベンチプレス」を開く' })).toHaveAttribute('aria-expanded', 'false')
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

  it('セットの削除は確認してから行う', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    open()
    await userEvent.click(await screen.findByRole('button', { name: '2セット目を削除' }))
    expect(confirm).toHaveBeenCalledWith('2セット目を削除しますか？')
    expect(screen.getByRole('checkbox', { name: '2セット目 完了' })).toBeInTheDocument()
    expect((await getWorkoutDetail(workoutId))!.exercises[0].sets).toHaveLength(2)

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: '2セット目を削除' }))
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: '2セット目 完了' })).toBeNull())
    expect((await getWorkoutDetail(workoutId))!.exercises[0].sets).toHaveLength(1)
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

  it('一時停止すると休憩タイマーも止まり、再開で動き出す', async () => {
    saveTimer(startTimer(90, Date.now()))
    open()
    await userEvent.click(await screen.findByRole('button', { name: '一時停止' }))
    expect(await screen.findByRole('button', { name: '再開' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('一時停止中')
    expect((await db.workouts.get(workoutId))!.pausedAt).toEqual(expect.any(Number))
    expect(loadTimer()?.pausedRemainingMs).toEqual(expect.any(Number))
    await userEvent.click(screen.getByRole('button', { name: '再開' }))
    expect(await screen.findByRole('button', { name: '一時停止' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('休憩中')
    expect(loadTimer()?.pausedRemainingMs).toBeUndefined()
  })

  it('一時停止中にセットをチェックすると再開する', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: '一時停止' }))
    await screen.findByRole('button', { name: '再開' })
    await userEvent.click(screen.getByRole('checkbox', { name: '1セット目 完了' }))
    expect(await screen.findByRole('button', { name: '一時停止' })).toBeInTheDocument()
    await waitFor(async () => expect((await db.workouts.get(workoutId))!.pausedAt).toBeUndefined())
    expect(screen.getByRole('timer')).toHaveTextContent('休憩中')
  })

  it('途中のトレーニングは「キャンセル」で記録ごと取り消し、休憩タイマーも止める', async () => {
    saveTimer(startTimer(90, Date.now()))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル（記録を取り消す）' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/')
    expect(await getActiveWorkout()).toBeUndefined()
    expect(loadTimer()).toBeNull()
  })

  describe('終了したトレーニング', () => {
    beforeEach(async () => {
      await finishWorkout(workoutId, {})
      saveTimer(startTimer(90, Date.now()))
    })

    it('一時停止ボタンは出さない', async () => {
      open()
      expect(await screen.findByRole('heading', { name: 'ベンチプレス' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '一時停止' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'キャンセル（記録を取り消す）' })).toBeNull()
    })

    it('休憩タイマーは小さなバーで出す', async () => {
      open()
      expect(await screen.findByRole('heading', { name: 'ベンチプレス' })).toBeInTheDocument()
      expect(screen.getByRole('timer')).toHaveClass('timer-bar')
    })

    it('削除しても動いている休憩タイマーは止めない', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      open()
      await userEvent.click(await screen.findByRole('button', { name: 'このトレーニングを削除' }))
      expect(await screen.findByTestId('current-path')).toHaveTextContent('/')
      expect(loadTimer()).not.toBeNull()
    })
  })
})

describe('きつさの入力（最後のセットのあと）', () => {
  const effortOf = async () => (await getWorkoutDetail(workoutId))!.exercises[0].workoutExercise.effort

  it('最後のセットにチェックすると「きつさは？」を出し、押すと保存して閉じる', async () => {
    open()
    await userEvent.click(await screen.findByRole('checkbox', { name: '1セット目 完了' }))
    await waitFor(async () => expect((await getWorkoutDetail(workoutId))!.exercises[0].sets[0].done).toBe(true))
    // 途中のセットでは出ない
    expect(screen.queryByRole('group', { name: 'きつさは？' })).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: '2セット目 完了' }))
    const prompt = await screen.findByRole('group', { name: 'きつさは？' })
    expect(prompt).toHaveTextContent('楽')
    expect(prompt).toHaveTextContent('限界')
    await userEvent.click(screen.getByRole('button', { name: 'きつさ 4' }))
    await waitFor(async () => expect(await effortOf()).toBe(4))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'きつさは？' })).toBeNull())
  })

  it('メモは消さずに残す', async () => {
    const we = (await getWorkoutDetail(workoutId))!.exercises[0].workoutExercise
    await db.workoutExercises.update(we.id, { note: 'グリップ幅を変えた' })
    open()
    await userEvent.click(await screen.findByRole('checkbox', { name: '1セット目 完了' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '2セット目 完了' }))
    await userEvent.click(await screen.findByRole('button', { name: 'きつさ 2' }))
    await waitFor(async () => expect(await effortOf()).toBe(2))
    expect((await getWorkoutDetail(workoutId))!.exercises[0].workoutExercise.note).toBe('グリップ幅を変えた')
  })

  it('×で閉じられる（保存しない）', async () => {
    open()
    await userEvent.click(await screen.findByRole('checkbox', { name: '1セット目 完了' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '2セット目 完了' }))
    await screen.findByRole('group', { name: 'きつさは？' })
    await userEvent.click(screen.getByRole('button', { name: 'きつさの入力を閉じる' }))
    expect(screen.queryByRole('group', { name: 'きつさは？' })).toBeNull()
    expect(await effortOf()).toBeUndefined()
  })

  it('すでにきつさがあれば出さない', async () => {
    const we = (await getWorkoutDetail(workoutId))!.exercises[0].workoutExercise
    await db.workoutExercises.update(we.id, { effort: 3 })
    open()
    await userEvent.click(await screen.findByRole('checkbox', { name: '1セット目 完了' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '2セット目 完了' }))
    await waitFor(async () => expect((await getWorkoutDetail(workoutId))!.exercises[0].sets[1].done).toBe(true))
    expect(screen.queryByRole('group', { name: 'きつさは？' })).toBeNull()
  })
})
