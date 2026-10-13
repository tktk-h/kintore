import { act, render, screen } from '@testing-library/react'
import userEvent from '../test/user'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('＋−で刻み幅ずつ変える', async () => {
    const onChange = vi.fn()
    render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    expect(onChange).toHaveBeenLastCalledWith(62.5)
    await userEvent.click(screen.getByRole('button', { name: '重量を減らす' }))
    expect(onChange).toHaveBeenLastCalledWith(60)
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

describe('Stepper（保存待ちの間）', () => {
  it('値が戻ってくる前に連打しても、増やした分がなくならない', async () => {
    const onChange = vi.fn()
    // 親は value を更新しない（DBの保存がまだ終わっていない状態）
    render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    const plus = screen.getByRole('button', { name: '重量を増やす' })
    await userEvent.click(plus)
    await userEvent.click(plus)
    expect(onChange.mock.calls).toEqual([[62.5], [65]])
    expect(screen.getByRole('button', { name: '重量 65kg' })).toBeInTheDocument()
  })

  it('value が外から変わったらそれに合わせる', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    rerender(<Stepper label="重量" unit="kg" value={80} step={2.5} onChange={onChange} />)
    expect(screen.getByRole('button', { name: '重量 80kg' })).toBeInTheDocument()
  })
})

describe('Stepper（再描画前の連打）', () => {
  it('同じタイミングで3回押しても3回分増える', async () => {
    const onChange = vi.fn()
    render(<Stepper label="重量" unit="kg" value={20} step={2.5} onChange={onChange} />)
    const inc = screen.getByRole('button', { name: '重量を増やす' })
    act(() => {
      inc.click()
      inc.click()
      inc.click()
    })
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([22.5, 25, 27.5])
  })
})
