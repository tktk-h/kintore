import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { loadTimer, pauseTimer, saveTimer, startTimer } from '../../lib/restTimer'
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
    expect(screen.getByRole('timer')).toHaveTextContent(/1:(30|29)/) // 負荷で1秒進むことがある
    await userEvent.click(screen.getByRole('button', { name: '＋15秒' }))
    expect(screen.getByRole('timer')).toHaveTextContent(/1:(45|44)/)
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

describe('RestTimerDisplay（終わったあと）', () => {
  const finishedAgo = (ms: number) => saveTimer({ endAt: Date.now() - ms, durationSec: 90 })

  it('終わって2分たったら自動で消える', async () => {
    finishedAgo(119_500)
    render(
      <RestTimerProvider>
        <RestTimerDisplay variant="bar" />
      </RestTimerProvider>,
    )
    expect(screen.getByRole('timer')).toHaveTextContent('休憩終了')
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull(), { timeout: 2000 })
    expect(loadTimer()).toBeNull()
  })

  it('画面を光らせるのは1つのタイマーにつき1回だけ', () => {
    finishedAgo(1000)
    const ui = (shown: boolean) => (
      <RestTimerProvider>{shown && <RestTimerDisplay variant="bar" />}</RestTimerProvider>
    )
    const { container, rerender } = render(ui(true))
    expect(container.querySelector('.screen-flash')).not.toBeNull()
    rerender(ui(false))
    rerender(ui(true))
    expect(screen.getByRole('timer')).toHaveTextContent('休憩終了')
    expect(container.querySelector('.screen-flash')).toBeNull()
  })
})

describe('RestTimerDisplay（一時停止）', () => {
  it('一時停止中は「一時停止中」と出し、残り時間が進まない', async () => {
    saveTimer(pauseTimer(startTimer(90, Date.now()), Date.now() + 30_000))
    render(
      <RestTimerProvider>
        <RestTimerDisplay variant="big" />
      </RestTimerProvider>,
    )
    expect(screen.getByRole('timer')).toHaveTextContent('一時停止中')
    expect(screen.getByRole('timer')).toHaveTextContent('1:00')
    await act(() => new Promise((r) => setTimeout(r, 1100)))
    expect(screen.getByRole('timer')).toHaveTextContent('1:00')
  })
})
