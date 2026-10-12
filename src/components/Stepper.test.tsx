import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('＋−で刻み幅ずつ変える', async () => {
    const onChange = vi.fn()
    render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    expect(onChange).toHaveBeenLastCalledWith(62.5)
    await userEvent.click(screen.getByRole('button', { name: '重量を減らす' }))
    expect(onChange).toHaveBeenLastCalledWith(57.5)
  })

  it('最小値より下にはならない', async () => {
    const onChange = vi.fn()
    render(<Stepper label="回数" value={0} step={1} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '回数を減らす' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('数字をタップすると直接入力できる', async () => {
    const onChange = vi.fn()
    render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量 60kg' }))
    const input = screen.getByRole('spinbutton', { name: '重量' })
    await userEvent.clear(input)
    await userEvent.type(input, '72.5')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith(72.5)
  })
})
