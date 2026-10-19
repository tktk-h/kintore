import { screen, within } from '@testing-library/react'
import userEvent from '../../test/user'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveBodyLog } from '../../repo/body'
import { assignRoutineToDate, getPlanForDate } from '../../repo/plans'
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

  it('予定の種目を押すと、内容と部位を詳しく見られる', async () => {
    const r = await createRoutine({
      name: '胸の日',
      exercises: [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }, { weight: 60, reps: 10 }] }],
    })
    await assignRoutineToDate(r.id, '2026-10-20')
    open('2026-10-20')
    await userEvent.click(await screen.findByRole('button', { name: /ベンチプレス.*10×3/ }))
    const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
    expect(sheet).toHaveTextContent('10×3')
    expect(sheet).toHaveTextContent('60kg')
    expect(sheet).toHaveTextContent('休憩2分')
    expect(sheet).toHaveTextContent('水平に押す')
    expect(sheet).toHaveTextContent('胸')
    expect(await within(sheet).findByText('記録なし')).toBeInTheDocument()
  })

  it('予定の種目は1行で回数×セットと重さ、上に種目数と目安の時間を出す', async () => {
    const r = await createRoutine({
      name: '胸の日',
      exercises: [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }, { weight: 60, reps: 10 }] }],
    })
    await assignRoutineToDate(r.id, '2026-10-20')
    open('2026-10-20')
    const row = await screen.findByRole('button', { name: 'ベンチプレス 10×3 ・ 60kg ・ 休憩2分' })
    expect(row).toHaveTextContent('10×3')
    expect(row).toHaveTextContent('60kg')
    expect(row).not.toHaveTextContent('休憩')
    expect(screen.getByText('1種目・約10分')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '予定を削除' })).toBeInTheDocument()
  })

  it('予定のトレーニングを始めたあとは、予定の種目は見るだけ', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 10 }] }] })
    const plan = await assignRoutineToDate(r.id, '2026-10-20')
    await startWorkout({ date: '2026-10-20', plan })
    open('2026-10-20')
    await userEvent.click(await screen.findByRole('button', { name: /ベンチプレス.*10×1/ }))
    const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
    expect(await within(sheet).findByText('始めたトレーニングはトレーニング画面で変えられます')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '保存' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'セット数を増やす' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'この種目を予定から外す' })).toBeNull()
  })
})
