import { HashRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { ExerciseEditPage } from './features/exercises/ExerciseEditPage'
import { ExerciseListPage } from './features/exercises/ExerciseListPage'
import { HomePage } from './features/home/HomePage'
import { RestTimerProvider } from './features/timer/RestTimerContext'

export function App() {
  return (
    <ToastProvider>
      <RestTimerProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="exercises" element={<ExerciseListPage />} />
              <Route path="exercises/new" element={<ExerciseEditPage />} />
              <Route path="exercises/:id" element={<ExerciseEditPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </RestTimerProvider>
    </ToastProvider>
  )
}
