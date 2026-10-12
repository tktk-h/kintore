import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// 画面は IndexedDB の読み込み（useLiveQuery）を待ってから表示されるため、PC の負荷が高いと
// findBy* / waitFor の既定の 1 秒では間に合わないことがある。待つ時間を 5 秒にする
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
})
