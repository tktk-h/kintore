import { Outlet, useMatch } from 'react-router'
import { RestTimerDisplay } from '../features/timer/RestTimerDisplay'
import { BottomNav } from './BottomNav'

export function Layout() {
  // トレーニング画面は自分でタイマーを出す（トレーニング中は大きな表示、終了後は小さなバー）
  const onWorkout = useMatch('/workout/:id')
  return (
    <>
      <main>
        <Outlet />
      </main>
      {!onWorkout && <RestTimerDisplay variant="bar" />}
      <BottomNav />
    </>
  )
}
