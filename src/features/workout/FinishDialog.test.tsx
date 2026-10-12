import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FinishDialog } from './FinishDialog'

describe('FinishDialog', () => {
  it('「終了する」を連打しても1回しか送らない', async () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => {}))
    render(<FinishDialog onCancel={vi.fn()} onSubmit={onSubmit} />)
    await userEvent.dblClick(screen.getByRole('button', { name: '終了する' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
