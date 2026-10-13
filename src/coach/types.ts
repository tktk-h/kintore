import type { MovementPattern, Muscle } from '../db/types'

export type SplitType = 'full_body' | 'upper_lower' | 'ppl' | 'ul_ppl'
export type DayType = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs'
export interface SlotPlan {
  slot: string                    // 例：'upper.1'
  patterns: MovementPattern[]     // この枠に入れてよい動き
  sets: number
  repRange: [number, number]
  restSec: number
  compound: boolean
}
export interface DayPlan { date: string; dayType: DayType; title: string; slots: SlotPlan[] }
export interface Skeleton {
  split: SplitType
  weekStart: string               // 月曜の日付
  days: DayPlan[]
  weeklySetTarget: [number, number]   // 部位ごとの週のセット数の目標
  deload: boolean
  /** 日数を減らした・分割法を変えたなどの理由（チャットやAIに伝える） */
  notes: string[]
}
export interface ProposalExercise { slot: string; exerciseId: string; sets: number; reps: number; repRange: [number, number]; restSec: number; weight?: number }
export interface ProposalDay { date: string; title: string; exercises: ProposalExercise[]; note?: string }
export interface Proposal { split: SplitType; days: ProposalDay[]; reasons: string; issues: string[]; muscleSets: Partial<Record<Muscle, number>> }
