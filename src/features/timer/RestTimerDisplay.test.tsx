import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RestTimerProvider, useRestTimer } from './RestTimerContext'
import { RestTimerDisplay } from './RestTimerDisplay'

function StartButton({ sec }: { sec: number }) {
  const { start } = useRestTimer()
  return <button onClick={() => start(sec)}>start</button>
}

function setup(sec: number) {
  render(
    <RestTimerProvider>
      <StartButton sec={sec} />
      <RestTimerDisplay variant="bar" />
    </RestTimerProvider>,
  )
}

describe('RestTimerDisplay', () => {
  it('開始前は何も表示しない', () => {
    setup(90)
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('開始すると残り時間を表示し、＋15秒で増える', async () => {
    setup(90)
    await userEvent.click(screen.getByText('start'))
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')
    await userEvent.click(screen.getByRole('button', { name: '＋15秒' }))
    expect(screen.getByRole('timer')).toHaveTextContent('1:45')
  })

  it('スキップで消える', async () => {
    setup(90)
    await userEvent.click(screen.getByText('start'))
    await userEvent.click(screen.getByRole('button', { name: 'スキップ' }))
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('0秒になると「休憩終了」と表示する', async () => {
    setup(1)
    await userEvent.click(screen.getByText('start'))
    await act(() => new Promise((r) => setTimeout(r, 1300)))
    expect(screen.getByRole('timer')).toHaveTextContent('休憩終了')
  })
})
