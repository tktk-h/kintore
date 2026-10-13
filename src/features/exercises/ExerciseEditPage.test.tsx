import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
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

  it('定番種目の動きの種類・部位・複数関節が表示される', async () => {
    renderPage('/exercises/:id', '/exercises/ex-bench-press', <ExerciseEditPage />)
    expect(await screen.findByRole('combobox', { name: '動きの種類' })).toHaveValue('horizontal_push')
    expect(within(screen.getByRole('group', { name: '主に使う部位' })).getByRole('button', { name: '胸' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: '補助で使う部位' })).getByRole('button', { name: '三頭' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: '補助で使う部位' })).getByRole('button', { name: '胸' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('combobox', { name: '複数関節' })).toHaveValue('yes')
  })

  it('自作種目に動きの種類・部位・複数関節を入れて保存できる', async () => {
    renderPage('/exercises/new', '/exercises/new', <ExerciseEditPage />)
    await userEvent.type(await screen.findByRole('textbox', { name: '名前' }), 'スミススクワット')
    expect(screen.getByRole('combobox', { name: '動きの種類' })).toHaveValue('')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '動きの種類' }), 'squat')
    const primary = screen.getByRole('group', { name: '主に使う部位' })
    const secondary = screen.getByRole('group', { name: '補助で使う部位' })
    await userEvent.click(within(primary).getByRole('button', { name: '前もも' }))
    await userEvent.click(within(primary).getByRole('button', { name: 'お尻' }))
    await userEvent.click(within(secondary).getByRole('button', { name: '裏もも' }))
    // 主と補助の両方には入らない
    await userEvent.click(within(secondary).getByRole('button', { name: 'お尻' }))
    expect(within(primary).getByRole('button', { name: 'お尻' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(primary).getByRole('button', { name: 'お尻' }))
    expect(within(secondary).getByRole('button', { name: 'お尻' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '複数関節' }), 'yes')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(async () => {
      const saved = (await db.exercises.toArray()).find((e) => e.name === 'スミススクワット')
      expect(saved).toMatchObject({ custom: true, pattern: 'squat', primary: ['quads', 'glutes'], secondary: ['hamstrings'], compound: true })
    })
  })

  it('何も選ばなければ情報なしで保存できる', async () => {
    renderPage('/exercises/new', '/exercises/new', <ExerciseEditPage />)
    await userEvent.type(await screen.findByRole('textbox', { name: '名前' }), '謎の種目')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => {
      const saved = (await db.exercises.toArray()).find((e) => e.name === '謎の種目')
      expect(saved).toBeDefined()
      expect(saved?.pattern).toBeUndefined()
      expect(saved?.compound).toBeUndefined()
    })
  })

  it('保存すると「メニュー」の種目タブへ戻る', async () => {
    renderPage('/exercises/new', '/exercises/new', <ExerciseEditPage />)
    await userEvent.type(await screen.findByRole('textbox', { name: '名前' }), '謎の種目')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/routines')
  })

  it('履歴がないときの戻る先は「メニュー」の種目タブ', async () => {
    renderPage('/exercises/:id', '/exercises/ex-bench-press', <ExerciseEditPage />)
    await screen.findByRole('textbox', { name: '名前' })
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/routines')
  })
})
