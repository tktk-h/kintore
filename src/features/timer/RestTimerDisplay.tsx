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
  const { state, adjust, skip } = useRestTimer()
  const now = useNow(state !== null)
  const remaining = state ? remainingSec(state, now) : 0
  const finished = state !== null && remaining === 0
  useWakeLock(state !== null && !finished)
  if (!state) return null

  const controls = (
    <>
      {!finished && (
        <>
          <button type="button" onClick={() => adjust(-15)}>
            −15秒
          </button>
          <button type="button" onClick={() => adjust(15)}>
            ＋15秒
          </button>
        </>
      )}
      <button type="button" onClick={skip}>
        {finished ? '閉じる' : 'スキップ'}
      </button>
    </>
  )

  return (
    <>
      {finished && <div className="screen-flash" />}
      <div className={`${variant === 'big' ? 'timer-big' : 'timer-bar'} ${finished ? 'flash' : ''}`} role="timer">
        <span>{finished ? '休憩終了！' : '休憩中'}</span>
        <span className="timer-time">{formatSeconds(remaining)}</span>
        {variant === 'big' ? <div className="row">{controls}</div> : controls}
      </div>
    </>
  )
}
