import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { RestTimerProvider } from '../features/timer/RestTimerContext'

function CurrentPath() {
  return <p data-testid="current-path">{useLocation().pathname}</p>
}

/** path にページを置いて url を開く。どこへ遷移したかは data-testid="current-path" で確認できる */
export function renderPage(path: string, url: string, page: ReactNode) {
  return render(
    <ToastProvider>
      <RestTimerProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={page} />
            <Route path="*" element={<CurrentPath />} />
          </Routes>
        </MemoryRouter>
      </RestTimerProvider>
    </ToastProvider>,
  )
}
