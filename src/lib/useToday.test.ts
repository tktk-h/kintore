import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToday } from './useToday'

afterEach(() => vi.useRealTimers())

describe('useToday', () => {
  it('アプリに戻ってきたときに日付が変わっていれば新しい日になる', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T23:59:00'))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-10-12')
    vi.setSystemTime(new Date('2026-10-13T07:00:00'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-10-13')
  })
})
