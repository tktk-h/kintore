import type { BodyPart, Equipment, Exercise, LogType } from './types'

type Row = [id: string, name: string, bodyPart: BodyPart, equipment: Equipment, logType: LogType, restSec: number]

const ROWS: Row[] = [
  // 胸
  ['bench-press', 'ベンチプレス', 'chest', 'barbell', 'weight_reps', 120],
  ['incline-bench-press', 'インクラインベンチプレス', 'chest', 'barbell', 'weight_reps', 120],
  ['dumbbell-press', 'ダンベルプレス', 'chest', 'dumbbell', 'weight_reps', 90],
  ['incline-dumbbell-press', 'インクラインダンベルプレス', 'chest', 'dumbbell', 'weight_reps', 90],
  ['dumbbell-fly', 'ダンベルフライ', 'chest', 'dumbbell', 'weight_reps', 60],
  ['chest-press', 'チェストプレス', 'chest', 'machine', 'weight_reps', 90],
  ['pec-deck', 'ペックデック', 'chest', 'machine', 'weight_reps', 60],
  ['cable-crossover', 'ケーブルクロスオーバー', 'chest', 'cable', 'weight_reps', 60],
  ['dips', 'ディップス', 'chest', 'bodyweight', 'reps', 90],
  ['push-up', '腕立て伏せ', 'chest', 'bodyweight', 'reps', 60],
  // 背中
  ['deadlift', 'デッドリフト', 'back', 'barbell', 'weight_reps', 180],
  ['barbell-row', 'ベントオーバーロウ', 'back', 'barbell', 'weight_reps', 120],
  ['one-arm-dumbbell-row', 'ワンハンドダンベルロウ', 'back', 'dumbbell', 'weight_reps', 90],
  ['lat-pulldown', 'ラットプルダウン', 'back', 'machine', 'weight_reps', 90],
  ['seated-cable-row', 'シーテッドロウ', 'back', 'cable', 'weight_reps', 90],
  ['machine-row', 'マシンロウ', 'back', 'machine', 'weight_reps', 90],
  ['t-bar-row', 'Tバーロウ', 'back', 'barbell', 'weight_reps', 90],
  ['pull-up', '懸垂', 'back', 'bodyweight', 'reps', 120],
  ['chin-up', '逆手懸垂', 'back', 'bodyweight', 'reps', 120],
  ['back-extension', 'バックエクステンション', 'back', 'bodyweight', 'reps', 60],
  // 脚
  ['squat', 'スクワット', 'legs', 'barbell', 'weight_reps', 180],
  ['front-squat', 'フロントスクワット', 'legs', 'barbell', 'weight_reps', 180],
  ['leg-press', 'レッグプレス', 'legs', 'machine', 'weight_reps', 120],
  ['romanian-deadlift', 'ルーマニアンデッドリフト', 'legs', 'barbell', 'weight_reps', 120],
  ['bulgarian-split-squat', 'ブルガリアンスクワット', 'legs', 'dumbbell', 'weight_reps', 90],
  ['lunge', 'ランジ', 'legs', 'dumbbell', 'weight_reps', 90],
  ['leg-extension', 'レッグエクステンション', 'legs', 'machine', 'weight_reps', 60],
  ['leg-curl', 'レッグカール', 'legs', 'machine', 'weight_reps', 60],
  ['hip-thrust', 'ヒップスラスト', 'legs', 'barbell', 'weight_reps', 90],
  ['calf-raise', 'カーフレイズ', 'legs', 'machine', 'weight_reps', 60],
  ['bodyweight-squat', '自重スクワット', 'legs', 'bodyweight', 'reps', 60],
  // 肩
  ['overhead-press', 'オーバーヘッドプレス', 'shoulders', 'barbell', 'weight_reps', 120],
  ['dumbbell-shoulder-press', 'ダンベルショルダープレス', 'shoulders', 'dumbbell', 'weight_reps', 90],
  ['shoulder-press-machine', 'ショルダープレスマシン', 'shoulders', 'machine', 'weight_reps', 90],
  ['side-raise', 'サイドレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60],
  ['rear-raise', 'リアレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60],
  ['front-raise', 'フロントレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60],
  ['face-pull', 'フェイスプル', 'shoulders', 'cable', 'weight_reps', 60],
  ['upright-row', 'アップライトロウ', 'shoulders', 'barbell', 'weight_reps', 60],
  // 腕
  ['barbell-curl', 'バーベルカール', 'arms', 'barbell', 'weight_reps', 60],
  ['dumbbell-curl', 'ダンベルカール', 'arms', 'dumbbell', 'weight_reps', 60],
  ['hammer-curl', 'ハンマーカール', 'arms', 'dumbbell', 'weight_reps', 60],
  ['preacher-curl', 'プリーチャーカール', 'arms', 'barbell', 'weight_reps', 60],
  ['cable-curl', 'ケーブルカール', 'arms', 'cable', 'weight_reps', 60],
  ['triceps-pushdown', 'トライセプスプッシュダウン', 'arms', 'cable', 'weight_reps', 60],
  ['lying-triceps-extension', 'ライイングトライセプスエクステンション', 'arms', 'barbell', 'weight_reps', 60],
  ['overhead-triceps-extension', 'オーバーヘッドトライセプスエクステンション', 'arms', 'dumbbell', 'weight_reps', 60],
  ['close-grip-bench-press', 'ナローベンチプレス', 'arms', 'barbell', 'weight_reps', 90],
  // 腹
  ['crunch', 'クランチ', 'abs', 'bodyweight', 'reps', 45],
  ['leg-raise', 'レッグレイズ', 'abs', 'bodyweight', 'reps', 45],
  ['hanging-leg-raise', 'ハンギングレッグレイズ', 'abs', 'bodyweight', 'reps', 60],
  ['ab-roller', 'アブローラー', 'abs', 'other', 'reps', 60],
  ['cable-crunch', 'ケーブルクランチ', 'abs', 'cable', 'weight_reps', 60],
  ['plank', 'プランク', 'abs', 'bodyweight', 'time_distance', 45],
  ['side-plank', 'サイドプランク', 'abs', 'bodyweight', 'time_distance', 45],
  // 有酸素
  ['running', 'ランニング', 'cardio', 'other', 'time_distance', 0],
  ['treadmill', 'トレッドミル', 'cardio', 'machine', 'time_distance', 0],
  ['walking', 'ウォーキング', 'cardio', 'other', 'time_distance', 0],
  ['exercise-bike', 'エアロバイク', 'cardio', 'machine', 'time_distance', 0],
  ['rowing-machine', 'ローイングマシン', 'cardio', 'machine', 'time_distance', 0],
  ['swimming', '水泳', 'cardio', 'other', 'time_distance', 0],
  ['jump-rope', '縄跳び', 'cardio', 'other', 'time_distance', 60],
  ['hiit', 'HIIT', 'cardio', 'other', 'time_distance', 60],
]

export function seedExercises(): Exercise[] {
  return ROWS.map(([id, name, bodyPart, equipment, logType, defaultRestSec]) => ({
    id: `ex-${id}`,
    name,
    bodyPart,
    equipment,
    logType,
    defaultRestSec,
    custom: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
  }))
}
