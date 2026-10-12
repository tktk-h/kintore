import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/workout.css'

// 端末の容量が少ないときにブラウザがデータを消さないよう頼む
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
