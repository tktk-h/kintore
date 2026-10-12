import { HashRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
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
            </Route>
          </Routes>
        </HashRouter>
      </RestTimerProvider>
    </ToastProvider>
  )
}
