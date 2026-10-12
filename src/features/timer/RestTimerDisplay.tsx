import { Check, Timer as TimerIcon } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { remainingSec } from '../../lib/restTimer'
import { formatSeconds } from '../../lib/workoutStats'
import { useNow, useRestTimer } from './RestTimerContext'
import { useWakeLock } from './useWakeLock'

/**
 * big: トレーニング画面の上部に出す大きな表示
 * bar: 他の画面で下に出す小さな表示
 * 音は鳴らさない（ジムで周りの迷惑になるため）。終わったら画面を光らせる
 */
export function RestTimerDisplay({ variant }: { variant: 'big' | 'bar' }) {
  const { state, adjust, skip, claimFlash } = useRestTimer()
  const now = useNow(state !== null)
  const remaining = state ? remainingSec(state, now) : 0
  const finished = state !== null && remaining === 0
  useWakeLock(state !== null && !finished)
  // 光らせるのは1つのタイマーにつき1回だけ（画面を移動して表示し直しても、また光らせない）
  const finishedEndAt = finished ? state.endAt : null
  const [flashEndAt, setFlashEndAt] = useState<number | null>(null)
  useEffect(() => {
    if (finishedEndAt !== null && claimFlash(finishedEndAt)) setFlashEndAt(finishedEndAt)
  }, [finishedEndAt, claimFlash])
  const flashing = finishedEndAt !== null && flashEndAt === finishedEndAt
  if (!state) return null
  // 残りの割合（見た目のバー用）
  const progress = state.durationSec > 0 ? Math.min(1, remaining / state.durationSec) : 0
  const classes = [variant === 'big' ? 'timer-big' : 'timer-bar', finished ? 'is-finished' : '', flashing ? 'flash' : '']

  return (
    <>
      {flashing && <div className="screen-flash" />}
      <div className={classes.filter(Boolean).join(' ')} role="timer" style={{ '--p': progress } as CSSProperties}>
        <div className="timer-text">
          <span className="timer-label">
            {finished ? <Check aria-hidden="true" /> : <TimerIcon aria-hidden="true" />}
            {finished ? '休憩終了！' : '休憩中'}
          </span>
          <span className="timer-time">{formatSeconds(remaining)}</span>
        </div>
        <div className="timer-progress" aria-hidden="true">
          <span />
        </div>
        <div className="timer-controls">
          {!finished && (
            <>
              <button type="button" onClick={() => adjust(-15)}>
                −15秒
              </button>
              {/* 全角の＋は幅が広いので、見た目だけ半角の + にする */}
              <button type="button" aria-label="＋15秒" onClick={() => adjust(15)}>
                +15秒
              </button>
            </>
          )}
          <button type="button" onClick={skip}>
            {finished ? '閉じる' : 'スキップ'}
          </button>
        </div>
      </div>
    </>
  )
}
