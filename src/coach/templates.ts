import type { MovementPattern, Muscle } from '../db/types'
import type { DayType } from './types'
import { PATTERN_MUSCLES } from './volume'

export interface SlotTemplate {
  slot: string
  patterns: MovementPattern[]
  compound: boolean
}

export const DAY_TITLES: Record<DayType, string> = {
  full: '全身', upper: '上半身', lower: '下半身', push: 'プッシュ', pull: 'プル', legs: '脚',
}

type Row = [patterns: MovementPattern[], compound: boolean]
const LOWER: Row[] = [
  [['squat'], true], [['hinge'], true], [['single_leg', 'quad_isolation'], true],
  [['hamstring'], false], [['calf'], false], [['core'], false],
]

/**
 * 日の種類ごとの枠（設計書「2. 日ごとの枠」の表）。複数関節の枠が先。
 * 全身の「上に押すか上から引く」「腕か腹」は日替わり：variant（その週の何回目の全身の日か、0始まり）の偶奇で入れ替える。
 * プルの最後の「二頭か前腕」は、前腕の動きの分類がないので二頭とする。
 */
function rows(dayType: DayType, variant: number): Row[] {
  const odd = variant % 2 === 1
  switch (dayType) {
    case 'full':
      return [
        [['squat'], true], [['horizontal_push'], true], [['horizontal_pull'], true], [['hinge'], true],
        [odd ? ['vertical_pull'] : ['vertical_push'], true],
        [odd ? ['core'] : ['biceps', 'triceps'], false],
      ]
    case 'upper':
      return [
        [['horizontal_push'], true], [['horizontal_pull'], true], [['vertical_push'], true], [['vertical_pull'], true],
        [['side_delt'], false], [['biceps'], false], [['triceps'], false],
      ]
    case 'lower':
    case 'legs':
      return LOWER
    case 'push':
      return [[['horizontal_push'], true], [['vertical_push'], true], [['chest_isolation'], false], [['side_delt'], false], [['triceps'], false]]
    case 'pull':
      return [[['vertical_pull'], true], [['horizontal_pull'], true], [['rear_delt'], false], [['biceps'], false], [['biceps'], false]]
  }
}

/** 枠の並び。枠のIDは「日の種類.番号（1始まり）」 */
export function daySlots(dayType: DayType, variant: number): SlotTemplate[] {
  return rows(dayType, variant).map(([patterns, compound], i) => ({
    slot: `${dayType}.${i + 1}`, patterns: [...patterns], compound,
  }))
}

/**
 * その日の種類で主に鍛える部位（すべての日替わりを含む）。
 * 48時間ルール（設計書「1. 分割法」）で、同じ部位の日かどうかの判定に使う。
 */
export function dayTypeMuscles(dayType: DayType): Muscle[] {
  const set = new Set<Muscle>()
  for (const variant of [0, 1]) {
    for (const [patterns] of rows(dayType, variant)) {
      for (const p of patterns) for (const m of PATTERN_MUSCLES[p].primary) set.add(m)
    }
  }
  return [...set]
}
