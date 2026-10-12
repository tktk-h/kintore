import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { adjustTimer, loadTimer, saveTimer, startTimer, type RestTimerState } from '../../lib/restTimer'

interface RestTimerApi {
  state: RestTimerState | null
  start: (sec: number) => void
  adjust: (deltaSec: number) => void
  skip: () => void
}

const RestTimerContext = createContext<RestTimerApi>({ state: null, start: () => {}, adjust: () => {}, skip: () => {} })

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RestTimerState | null>(() => loadTimer())
  const update = useCallback((next: RestTimerState | null) => {
    setState(next)
    saveTimer(next)
  }, [])
  const api = useMemo<RestTimerApi>(
    () => ({
      state,
      start: (sec) => update(sec > 0 ? startTimer(sec, Date.now()) : null),
      adjust: (delta) => {
        if (state) update(adjustTimer(state, delta, Date.now()))
      },
      skip: () => update(null),
    }),
    [state, update],
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
