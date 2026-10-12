import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CollapsibleCard } from './CollapsibleCard'

const ui = (summary?: string) => (
  <CollapsibleCard storageKey="test.card" title="体重" summary={summary} actions={<button type="button">修正</button>}>
    <p>中身</p>
  </CollapsibleCard>
)

afterEach(() => vi.restoreAllMocks())

describe('CollapsibleCard', () => {
  it('最初は開いていて、ボタンでたたむと中身が消え、見出しは残る', async () => {
    render(ui('70kg'))
    expect(screen.getByRole('heading', { name: '体重' })).toBeInTheDocument()
    expect(screen.getByText('中身')).toBeInTheDocument()
    expect(screen.queryByText('70kg')).toBeNull()
    const toggle = screen.getByRole('button', { name: '「体重」をたたむ' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(toggle)
    expect(screen.queryByText('中身')).toBeNull()
    expect(screen.getByRole('heading', { name: '体重' })).toBeInTheDocument()
    expect(screen.getByText('70kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '「体重」を開く' })).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(screen.getByRole('button', { name: '「体重」を開く' }))
    expect(screen.getByText('中身')).toBeInTheDocument()
  })

  it('たたんだことを覚えている', async () => {
    const { unmount } = render(ui())
    await userEvent.click(screen.getByRole('button', { name: '「体重」をたたむ' }))
    unmount()
    render(ui())
    expect(screen.queryByText('中身')).toBeNull()
    expect(screen.getByRole('button', { name: '「体重」を開く' })).toBeInTheDocument()
  })

  it('保存できなくても開け閉めできる', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(ui())
    expect(screen.getByText('中身')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '「体重」をたたむ' }))
    expect(screen.queryByText('中身')).toBeNull()
  })

  it('たたんでいる間は、開いているとき用の操作を出さない', async () => {
    render(
      <CollapsibleCard storageKey="test.card2" title="ベンチプレス" actions={<button type="button">メモ</button>} actionsWhenCollapsed={false}>
        <p>中身</p>
      </CollapsibleCard>,
    )
    expect(screen.getByRole('button', { name: 'メモ' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '「ベンチプレス」をたたむ' }))
    expect(screen.queryByRole('button', { name: 'メモ' })).toBeNull()
  })
})
