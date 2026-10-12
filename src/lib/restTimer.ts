export interface RestTimerState {
  /** 終了予定の時刻（ミリ秒）。時刻で持つので、アプリを閉じても残り時間がずれない */
  endAt: number
  durationSec: number
}

const STORAGE_KEY = 'kintore.restTimer'

export function startTimer(durationSec: number, now: number): RestTimerState {
  return { endAt: now + durationSec * 1000, durationSec }
}

export function remainingSec(state: RestTimerState, now: number): number {
  return Math.max(0, Math.ceil((state.endAt - now) / 1000))
}

export function adjustTimer(state: RestTimerState, deltaSec: number, now: number): RestTimerState {
  return {
    endAt: Math.max(now, state.endAt + deltaSec * 1000),
    durationSec: Math.max(0, state.durationSec + deltaSec),
  }
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
    return typeof v.endAt === 'number' && typeof v.durationSec === 'number'
      ? { endAt: v.endAt, durationSec: v.durationSec }
      : null
  } catch {
    return null
  }
}
