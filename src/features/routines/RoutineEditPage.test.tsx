import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { listRoutines } from '../../repo/routines'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { RoutineEditPage } from './RoutineEditPage'

beforeEach(resetDb)

describe('RoutineEditPage', () => {
  it('名前と種目を入れて保存できる', async () => {
    renderPage('/routines/new', '/routines/new', <RoutineEditPage />)
    await userEvent.type(await screen.findByRole('textbox', { name: '名前' }), '胸の日')
    await userEvent.click(screen.getByRole('button', { name: '＋ 種目を追加' }))
    await userEvent.click(await screen.findByRole('button', { name: /^ベンチプレス/ }))
    expect(await screen.findAllByRole('button', { name: '重量 20kg' })).toHaveLength(3)
    await userEvent.click(screen.getAllByRole('button', { name: '重量を増やす' })[0])
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => expect(await listRoutines()).toHaveLength(1))
    const [routine] = await listRoutines()
    expect(routine.name).toBe('胸の日')
    expect(routine.exercises[0]).toMatchObject({ exerciseId: 'ex-bench-press', restSec: 120 })
    expect(routine.exercises[0].sets[0]).toEqual({ weight: 22.5, reps: 10 })
  })
})
