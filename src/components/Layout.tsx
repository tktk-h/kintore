import { Outlet, useMatch } from 'react-router'
import { RestTimerDisplay } from '../features/timer/RestTimerDisplay'
import { BottomNav } from './BottomNav'

export function Layout() {
  // トレーニング画面は自分で大きなタイマーを出すので、小さなバーは出さない
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
