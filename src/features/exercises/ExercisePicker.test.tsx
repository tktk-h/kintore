import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '../../test/db'
import { ExercisePicker } from './ExercisePicker'

beforeEach(resetDb)

describe('ExercisePicker', () => {
  it('検索して選べる', async () => {
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'べんち')
    await userEvent.click(await screen.findByRole('button', { name: /^ベンチプレス/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex-bench-press' }))
  })

  it('部位で絞り込める', async () => {
    render(<ExercisePicker onPick={() => {}} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '脚' }))
    expect(await screen.findByRole('button', { name: /^スクワット/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ベンチプレス/ })).toBeNull()
  })
})
