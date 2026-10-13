import { render, screen } from '@testing-library/react'
import userEvent from '../../test/user'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Exercise, type SetRecord } from '../../db/types'
import { newRecord } from '../../lib/records'
import { SetRow } from './SetRow'

const exercise = newRecord<Exercise>({
  name: 'ベンチプレス',
  bodyPart: 'chest',
  equipment: 'barbell',
  logType: 'weight_reps',
  defaultRestSec: 90,
  custom: false,
})
const set = newRecord<SetRecord>({ workoutId: 'w', workoutExerciseId: 'we', order: 0, done: false, weight: 60, reps: 8 })

const row = (s: SetRecord, onToggle = vi.fn()) => (
  <SetRow index={0} set={s} exercise={exercise} settings={DEFAULT_SETTINGS} onChange={vi.fn()} onToggle={onToggle} onDelete={vi.fn()} />
)

describe('SetRow', () => {
  it('保存が終わる前でも、チェックはすぐに付く', async () => {
    const onToggle = vi.fn()
    render(row(set, onToggle))
    await userEvent.click(screen.getByRole('checkbox', { name: '1セット目 完了' }))
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(screen.getByRole('checkbox', { name: '1セット目 完了' })).toBeChecked()
  })

  it('記録の done が変わったらそれに合わせる', () => {
    const { rerender } = render(row(set))
    expect(screen.getByRole('checkbox', { name: '1セット目 完了' })).not.toBeChecked()
    rerender(row({ ...set, done: true }))
    expect(screen.getByRole('checkbox', { name: '1セット目 完了' })).toBeChecked()
  })
})
