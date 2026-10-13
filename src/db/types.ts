import type { Proposal, SplitType } from '../coach/types'

export type BodyPart = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'abs' | 'cardio'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'
/**
 * weight_reps: 重量×回数
 * reps: 回数のみ（weight は加重ならプラス、補助ならマイナス）
 * time_distance: 時間・距離
 */
export type LogType = 'weight_reps' | 'reps' | 'time_distance'
export type Rating = 1 | 2 | 3 | 4 | 5

export type MovementPattern =
  | 'squat' | 'hinge' | 'single_leg' | 'horizontal_push' | 'vertical_push'
  | 'horizontal_pull' | 'vertical_pull' | 'chest_isolation' | 'side_delt'
  | 'rear_delt' | 'biceps' | 'triceps' | 'hamstring' | 'quad_isolation'
  | 'calf' | 'core' | 'cardio'

export type Muscle =
  | 'chest' | 'back' | 'front_delt' | 'side_delt' | 'rear_delt' | 'biceps'
  | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs'

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'スクワット系', hinge: 'ヒンジ系', single_leg: '片脚', horizontal_push: '水平に押す',
  vertical_push: '上に押す', horizontal_pull: '水平に引く', vertical_pull: '上から引く',
  chest_isolation: '胸の単関節', side_delt: '横肩', rear_delt: '後ろ肩', biceps: '二頭',
  triceps: '三頭', hamstring: '裏もも', quad_isolation: '前もも', calf: 'ふくらはぎ', core: '腹', cardio: '有酸素',
}
export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: '胸', back: '背中', front_delt: '前肩', side_delt: '横肩', rear_delt: '後ろ肩', biceps: '二頭',
  triceps: '三頭', quads: '前もも', hamstrings: '裏もも', glutes: 'お尻', calves: 'ふくらはぎ', abs: '腹',
}
export const MOVEMENT_PATTERNS = Object.keys(MOVEMENT_PATTERN_LABELS) as MovementPattern[]
export const MUSCLES = Object.keys(MUSCLE_LABELS) as Muscle[]

/** 同期できるように、すべての記録が持つ項目 */
export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface Exercise extends BaseRecord {
  name: string
  bodyPart: BodyPart
  equipment: Equipment
  logType: LogType
  defaultRestSec: number
  custom: boolean
  /** 動きの種類（既存データと自作種目のために任意） */
  pattern?: MovementPattern
  /** 主に使う部位 */
  primary?: Muscle[]
  /** 補助で使う部位 */
  secondary?: Muscle[]
  /** 複数関節の種目か */
  compound?: boolean
}

export interface SetValues {
  weight?: number
  reps?: number
  durationSec?: number
  distanceKm?: number
}

export interface PlannedExercise {
  exerciseId: string
  restSec: number
  sets: SetValues[]
  /** AIコーチの案から入れたときの枠（例：'upper.1'） */
  slot?: string
  /** 目標回数の幅 */
  repRange?: [number, number]
}

export interface Routine extends BaseRecord {
  name: string
  exercises: PlannedExercise[]
}

/** ai: AIコーチの案を反映したもの */
export type PlanSource = 'routine' | 'manual' | 'ai'

export interface PlannedWorkout extends BaseRecord {
  date: string
  title: string
  exercises: PlannedExercise[]
  source: PlanSource
  routineId?: string
}

export interface Workout extends BaseRecord {
  date: string
  title?: string
  startedAt: number
  finishedAt?: number
  /** 一時停止した時刻。一時停止中だけある */
  pausedAt?: number
  /** これまでに一時停止していた時間の合計（ミリ秒） */
  pausedMs?: number
  condition?: Rating
  satisfaction?: Rating
  note?: string
  plannedWorkoutId?: string
}

export interface WorkoutExercise extends BaseRecord {
  workoutId: string
  exerciseId: string
  order: number
  restSec: number
  /** きつさ（5段階） */
  effort?: Rating
  note?: string
}

export interface SetRecord extends BaseRecord, SetValues {
  workoutId: string
  workoutExerciseId: string
  order: number
  done: boolean
  doneAt?: number
}

export interface BodyLog extends BaseRecord {
  date: string
  weightKg?: number
  bodyFatPct?: number
  /** 縮小した JPEG の data URL */
  photo?: string
}

export interface Settings {
  id: 'app'
  weightStep: number
  repStep: number
  /** AIコーチ（サーバー）に送る合言葉 */
  coachPasscode?: string
}

export const DEFAULT_SETTINGS: Settings = { id: 'app', weightStep: 2.5, repStep: 1 }

export const BODY_PARTS: BodyPart[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'abs', 'cardio']

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  abs: '腹',
  cardio: '有酸素',
}

export const BODY_PART_COLORS: Record<BodyPart, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  legs: '#22c55e',
  shoulders: '#f59e0b',
  arms: '#a855f7',
  abs: '#14b8a6',
  cardio: '#ec4899',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'バーベル',
  dumbbell: 'ダンベル',
  machine: 'マシン',
  cable: 'ケーブル',
  bodyweight: '自重',
  other: 'その他',
}

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  weight_reps: '重量×回数',
  reps: '回数のみ',
  time_distance: '時間・距離',
}

export type Goal = 'hypertrophy' | 'strength' | 'fat_loss' | 'health'
export type Experience = 'none' | 'under_1y' | 'y1_3' | 'over_3y'
export type EquipmentAccess = 'gym_free' | 'gym_machine' | 'home_dumbbell' | 'bodyweight'
export interface BaselineLift { exerciseId: string; weight: number; reps: number }
export interface Profile {
  id: 'me'
  goal: Goal
  experience: Experience
  /** 1〜7 */
  daysPerWeek: number
  /** 例：60 */
  minutesPerSession: number
  /** 0=日〜6=土 */
  weekdays: number[]
  equipment: EquipmentAccess[]
  /** 自由記入（空でもよい） */
  injuries: string
  /** 任意 */
  baselines: BaselineLift[]
  /** チャットで変更されたとき */
  preferredSplit?: SplitType
  updatedAt: number
}
export interface ChatMessage extends BaseRecord {
  role: 'user' | 'coach'
  text: string
  /** 重さ計算・チェック済みのメニュー案 */
  proposal?: Proposal
  appliedAt?: number
}
