import { render, screen } from '@testing-library/react'
import userEvent from '../test/user'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'

function Where() {
  return <p data-testid="path">{useLocation().pathname}</p>
}

function setup(entries: string[], index: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/detail" element={<PageHeader backTo="/fallback" eyebrow="10月12日" title="詳細" />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PageHeader', () => {
  it('履歴があれば前のページへ戻る', async () => {
    setup(['/prev', '/detail'], 1)
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/prev')
  })

  it('履歴がなければ指定の親ページへ移動する', async () => {
    setup(['/detail'], 0)
    expect(screen.getByRole('heading', { name: '詳細' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/fallback')
  })

  it('backTo がなければ戻るボタンを出さない', () => {
    render(
      <MemoryRouter>
        <PageHeader title="ルート" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
  })
})
