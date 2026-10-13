import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { BodyPage } from './features/body/BodyPage'
import { DayDetailPage } from './features/calendar/DayDetailPage'
import { CoachPage } from './features/coach/CoachPage'
import { ProfilePage } from './features/coach/ProfilePage'
import { ExerciseEditPage } from './features/exercises/ExerciseEditPage'
import { HomePage } from './features/home/HomePage'
import { MenuPage } from './features/routines/MenuPage'
import { RoutineEditPage } from './features/routines/RoutineEditPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { RestTimerProvider } from './features/timer/RestTimerContext'
import { WorkoutPage } from './features/workout/WorkoutPage'

/** 画面の一覧（テストでは MemoryRouter の中で使う） */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="coach" element={<CoachPage />} />
        <Route path="coach/profile" element={<ProfilePage />} />
        {/* 種目の一覧は「メニュー」画面のタブに移した */}
        <Route path="exercises" element={<Navigate to="/routines?tab=exercises" replace />} />
        <Route path="exercises/new" element={<ExerciseEditPage />} />
        <Route path="exercises/:id" element={<ExerciseEditPage />} />
        <Route path="workout/:id" element={<WorkoutPage />} />
        <Route path="day/:date" element={<DayDetailPage />} />
        <Route path="body" element={<BodyPage />} />
        <Route path="routines" element={<MenuPage />} />
        <Route path="routines/new" element={<RoutineEditPage />} />
        <Route path="routines/:id" element={<RoutineEditPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ToastProvider>
      <RestTimerProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </RestTimerProvider>
    </ToastProvider>
  )
}
