import type { BodyPart, LogType, SetValues } from '../db/types'

/** SetRecord などからセットの値だけを取り出す */
export function valuesOf(s: SetValues): SetValues {
  const v: SetValues = {}
  if (s.weight !== undefined) v.weight = s.weight
  if (s.reps !== undefined) v.reps = s.reps
  if (s.durationSec !== undefined) v.durationSec = s.durationSec
  if (s.distanceKm !== undefined) v.distanceKm = s.distanceKm
  return v
}

/** 前回の記録も予定もないときの初期値 */
export function defaultSets(logType: LogType, bodyPart: BodyPart): SetValues[] {
  if (logType === 'time_distance') {
    return bodyPart === 'cardio' ? [{ durationSec: 1800 }] : [{ durationSec: 60 }, { durationSec: 60 }, { durationSec: 60 }]
  }
  if (logType === 'reps') return [{ reps: 10 }, { reps: 10 }, { reps: 10 }]
  return [
    { weight: 20, reps: 10 },
    { weight: 20, reps: 10 },
    { weight: 20, reps: 10 },
  ]
}
