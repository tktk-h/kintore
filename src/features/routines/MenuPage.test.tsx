import { render, screen, within } from '@testing-library/react'
import userEvent from '../../test/user'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../App'
import { ToastProvider } from '../../components/Toast'
import { createRoutine } from '../../repo/routines'
import { resetDb } from '../../test/db'
import { RestTimerProvider } from '../timer/RestTimerContext'

beforeEach(resetDb)

const openApp = (url: string) =>
  render(
    <ToastProvider>
      <RestTimerProvider>
        <MemoryRouter initialEntries={[url]}>
          <AppRoutes />
        </MemoryRouter>
      </RestTimerProvider>
    </ToastProvider>,
  )

describe('MenuPage', () => {
  it('最初はマイメニューのタブを出す（タブのルートなので戻るボタンはない）', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    openApp('/routines')
    expect(await screen.findByRole('tab', { name: 'マイメニュー' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('link', { name: /胸の日/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '新規' })).toHaveAttribute('href', '/routines/new')
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
  })

  it('「種目」タブに切り替えると種目の一覧と追加ボタンを出す', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    openApp('/routines')
    await userEvent.click(await screen.findByRole('tab', { name: '種目' }))
    expect(screen.getByRole('tab', { name: '種目' })).toHaveAttribute('aria-selected', 'true')
    // 種目が多いので、役割での検索（重い）ではなく文字で探す
    expect((await screen.findByText('ベンチプレス')).closest('a')).toHaveAttribute('href', '/exercises/ex-bench-press')
    expect(screen.getByRole('link', { name: '追加' })).toHaveAttribute('href', '/exercises/new')
    expect(screen.queryByText('胸の日')).toBeNull()
  })

  it('/routines?tab=exercises で種目のタブを開く', async () => {
    openApp('/routines?tab=exercises')
    expect(await screen.findByRole('tab', { name: '種目' })).toHaveAttribute('aria-selected', 'true')
  })

  it('/exercises は種目のタブへ移る', async () => {
    openApp('/exercises')
    expect(await screen.findByRole('tab', { name: '種目' })).toHaveAttribute('aria-selected', 'true')
  })

  it('下のメニューは ホーム／AIコーチ／メニュー／体／設定', async () => {
    openApp('/routines')
    const nav = await screen.findByRole('navigation', { name: 'メインメニュー' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['ホーム', 'AIコーチ', 'メニュー', '体', '設定'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/coach', '/routines', '/body', '/settings'])
    expect(within(nav).getByRole('link', { name: 'メニュー' })).toHaveClass('active')
  })
})
