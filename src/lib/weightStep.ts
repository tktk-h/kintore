import { DEFAULT_SETTINGS, type Equipment, type Settings } from '../db/types'

/**
 * 種目の重さの刻み幅。ダンベルの種目は設定の「ダンベルの刻み幅」（ない・正しくないときは1kg）、
 * それ以外は「重量の刻み幅」
 */
export function weightStepFor(settings: Pick<Settings, 'weightStep' | 'dumbbellStep'>, equipment: Equipment | undefined): number {
  if (equipment !== 'dumbbell') return settings.weightStep
  const step = Number(settings.dumbbellStep)
  return step > 0 ? step : DEFAULT_SETTINGS.dumbbellStep!
}
