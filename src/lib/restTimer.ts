export interface RestTimerState {
  /** 終了予定の時刻（ミリ秒）。時刻で持つので、アプリを閉じても残り時間がずれない */
  endAt: number
  durationSec: number
  /** 一時停止中だけある。止めたときの残り時間（ミリ秒） */
  pausedRemainingMs?: number
}

const STORAGE_KEY = 'kintore.restTimer'

export function startTimer(durationSec: number, now: number): RestTimerState {
  return { endAt: now + durationSec * 1000, durationSec }
}

export function isTimerPaused(state: RestTimerState): boolean {
  return state.pausedRemainingMs !== undefined
}

function remainingMs(state: RestTimerState, now: number): number {
  return Math.max(0, state.pausedRemainingMs ?? state.endAt - now)
}

export function remainingSec(state: RestTimerState, now: number): number {
  return Math.ceil(remainingMs(state, now) / 1000)
}

export function adjustTimer(state: RestTimerState, deltaSec: number, now: number): RestTimerState {
  const durationSec = Math.max(0, state.durationSec + deltaSec)
  if (state.pausedRemainingMs !== undefined) {
    return { ...state, durationSec, pausedRemainingMs: Math.max(0, state.pausedRemainingMs + deltaSec * 1000) }
  }
  return { endAt: Math.max(now, state.endAt + deltaSec * 1000), durationSec }
}

/** 残り時間をそのまま止める。もう止まっている・終わっているタイマーは変えない */
export function pauseTimer(state: RestTimerState, now: number): RestTimerState {
  const left = remainingMs(state, now)
  if (isTimerPaused(state) || left === 0) return state
  return { ...state, pausedRemainingMs: left }
}

/** 止めたときの残り時間から、また進める */
export function resumeTimer(state: RestTimerState, now: number): RestTimerState {
  if (state.pausedRemainingMs === undefined) return state
  return { endAt: now + state.pausedRemainingMs, durationSec: state.durationSec }
}

export function saveTimer(state: RestTimerState | null): void {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 保存できなくてもタイマー自体は動く
  }
}

export function loadTimer(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<RestTimerState>
    if (typeof v.endAt !== 'number' || typeof v.durationSec !== 'number') return null
    const state: RestTimerState = { endAt: v.endAt, durationSec: v.durationSec }
    if (typeof v.pausedRemainingMs === 'number') state.pausedRemainingMs = v.pausedRemainingMs
    return state
  } catch {
    return null
  }
}
