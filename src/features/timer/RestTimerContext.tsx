import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adjustTimer, loadTimer, saveTimer, startTimer, type RestTimerState } from '../../lib/restTimer'

interface RestTimerApi {
  state: RestTimerState | null
  start: (sec: number) => void
  adjust: (deltaSec: number) => void
  skip: () => void
  /** このタイマーで画面を光らせてよいか。1つのタイマーにつき最初の1回だけ true */
  claimFlash: (endAt: number) => boolean
}

/** 終わったタイマーはこの時間がたったら自動で消す */
export const CLEAR_AFTER_MS = 2 * 60 * 1000

const RestTimerContext = createContext<RestTimerApi>({
  state: null,
  start: () => {},
  adjust: () => {},
  skip: () => {},
  claimFlash: () => false,
})

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RestTimerState | null>(() => loadTimer())
  const update = useCallback((next: RestTimerState | null) => {
    setState(next)
    saveTimer(next)
  }, [])
  useEffect(() => {
    if (!state) return
    const t = window.setTimeout(() => update(null), Math.max(0, state.endAt + CLEAR_AFTER_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [state, update])
  const flashedEndAt = useRef<number | null>(null)
  const claimFlash = useCallback((endAt: number) => {
    if (flashedEndAt.current === endAt) return false
    flashedEndAt.current = endAt
    return true
  }, [])
  const api = useMemo<RestTimerApi>(
    () => ({
      state,
      start: (sec) => update(sec > 0 ? startTimer(sec, Date.now()) : null),
      adjust: (delta) => {
        if (state) update(adjustTimer(state, delta, Date.now()))
      },
      skip: () => update(null),
      claimFlash,
    }),
    [state, update, claimFlash],
  )
  return <RestTimerContext.Provider value={api}>{children}</RestTimerContext.Provider>
}

export function useRestTimer() {
  return useContext(RestTimerContext)
}

/** active の間だけ、現在時刻を定期的に更新する */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [active, intervalMs])
  return now
}
