import { render, screen } from '@testing-library/react'
import userEvent from '../test/user'
import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '../db/types'
import { SetInputs } from './SetInputs'

const settings: Settings = { id: 'app', weightStep: 2.5, repStep: 1, dumbbellStep: 1 }

describe('SetInputs', () => {
  it('ダンベルの種目の重さはダンベルの刻み幅で変える', async () => {
    const onChange = vi.fn()
    render(<SetInputs logType="weight_reps" bodyPart="chest" equipment="dumbbell" values={{ weight: 12, reps: 10 }} settings={settings} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    expect(onChange).toHaveBeenLastCalledWith({ weight: 13 })
  })

  it('ダンベル以外は重量の刻み幅で変える', async () => {
    const onChange = vi.fn()
    render(<SetInputs logType="weight_reps" bodyPart="chest" equipment="barbell" values={{ weight: 60, reps: 10 }} settings={settings} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    expect(onChange).toHaveBeenLastCalledWith({ weight: 62.5 })
  })

  it('ダンベルの刻み幅がない古い設定なら1kg', async () => {
    const onChange = vi.fn()
    render(<SetInputs logType="reps" bodyPart="back" equipment="dumbbell" values={{ weight: 0, reps: 10 }}
      settings={{ id: 'app', weightStep: 2.5, repStep: 1 }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '加重を増やす' }))
    expect(onChange).toHaveBeenLastCalledWith({ weight: 1 })
  })
})
