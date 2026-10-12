import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { ExerciseEditPage } from './ExerciseEditPage'

beforeEach(resetDb)

describe('ExerciseEditPage', () => {
  it('既存の種目を編集できる', async () => {
    renderPage('/exercises/:id', '/exercises/ex-bench-press', <ExerciseEditPage />)
    expect(await screen.findByRole('textbox', { name: '名前' })).toHaveValue('ベンチプレス')
  })

  it('見つからない種目なら空の編集画面を出さない', async () => {
    renderPage('/exercises/:id', '/exercises/no-such', <ExerciseEditPage />)
    expect(await screen.findByText('種目が見つかりません')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '名前' })).toBeNull()
expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument()
  })
})
