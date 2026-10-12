import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveBodyLog } from '../../repo/body'
import { getPlanForDate } from '../../repo/plans'
import { createRoutine } from '../../repo/routines'
import { setDone, updateExerciseNote } from '../../repo/workoutEdits'
import { finishWorkout, getWorkoutDetail, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { DayDetailPage } from './DayDetailPage'

beforeEach(resetDb)

const open = (date: string) => renderPage('/day/:date', `/day/${date}`, <DayDetailPage />)

describe('DayDetailPage', () => {
  it('その日に入力したすべての情報を表示する', async () => {
    const id = await startWorkout({ date: '2026-10-12', title: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 6 }] }] })
    const d = (await getWorkoutDetail(id))!
    await setDone(d.exercises[0].sets[0].id, true)
    await updateExerciseNote(d.exercises[0].workoutExercise.id, { effort: 4, note: '肩が少し痛い' })
    await finishWorkout(id, { condition: 4, satisfaction: 5, note: '良い日' })
    await saveBodyLog('2026-10-12', { weightKg: 70, bodyFatPct: 15 })

    open('2026-10-12')
    expect(await screen.findByRole('heading', { name: '10月12日(月)' })).toBeInTheDocument()
    expect(await screen.findByText('胸の日')).toBeInTheDocument()
    expect(screen.getByText('60kg × 8')).toBeInTheDocument()
    expect(screen.getByText('60kg × 6')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getAllByText('未完了')).toHaveLength(1)
    expect(screen.getByText('1セット 480kg')).toBeInTheDocument()
    expect(screen.getByText(/総重量 480kg/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument()
    expect(screen.getByText(/肩が少し痛い/)).toBeInTheDocument()
    expect(screen.getByText(/調子 🙂/)).toBeInTheDocument()
    expect(screen.getByText(/満足度 5/)).toBeInTheDocument()
    expect(screen.getByText(/良い日/)).toBeInTheDocument()
    expect(screen.getByText(/体重 70kg/)).toBeInTheDocument()
    expect(screen.getByText(/体脂肪率 15%/)).toBeInTheDocument()
  })

  it('マイメニューを割り当てて予定にできる', async () => {
    await createRoutine({ name: '脚の日', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }] })
    open('2026-10-20')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'マイメニュー' }), '脚の日')
    await userEvent.click(screen.getByRole('button', { name: '予定にする' }))
    expect(await screen.findByText('予定：脚の日')).toBeInTheDocument()
    expect((await getPlanForDate('2026-10-20'))?.title).toBe('脚の日')
  })
})
