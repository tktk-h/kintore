import type { Experience } from '../db/types'
import { addDays } from '../lib/dates'
import { dayTypeMuscles } from './templates'
import type { DayType, SplitType } from './types'
import { isBeginner } from './volume'

export const SPLIT_LABELS: Record<SplitType, string> = {
  full_body: '全身法',
  upper_lower: '上半身・下半身',
  ppl: 'プッシュ・プル・脚',
  ul_ppl: '上半身・下半身・プッシュ・プル・脚',
}

/** 同じ部位を鍛える日の間にあける日数（48時間） */
export const MIN_GAP_DAYS = 2

/** 週の日数として扱う数：1〜6（7日は6日扱い）。初めて・1年未満は最大4（設計書「1. 分割法」） */
export function effectiveDays(days: number, experience: Experience): number {
  const d = Math.min(6, Math.max(1, Math.round(days)))
  return isBeginner(experience) ? Math.min(4, d) : d
}

/** その分割法が組める最小の日数 */
const MIN_DAYS: Record<SplitType, number> = { full_body: 1, upper_lower: 2, ppl: 3, ul_ppl: 5 }

/**
 * 分割法の選択（設計書「1. 分割法」の表）
 * 1〜3日→全身法（3日は経験1年以上で希望があればPPL）、4日→上半身・下半身、5日→上下＋PPL、6〜7日→PPL。
 * 初心者は日数を4日までに抑える。チャットで頼まれた分割法（preferred）は組めるなら使う
 * （PPL系は経験1年以上のみ）。
 */
export function chooseSplit(days: number, experience: Experience, preferred?: SplitType): SplitType {
  const d = effectiveDays(days, experience)
  if (preferred && d >= MIN_DAYS[preferred]) {
    const needsExperience = preferred === 'ppl' || preferred === 'ul_ppl'
    if (!needsExperience || !isBeginner(experience)) return preferred
  }
  if (d <= 3) return 'full_body'
  if (d === 4) return 'upper_lower'
  if (d === 5) return 'ul_ppl'
  return 'ppl'
}

const CYCLES: Record<SplitType, DayType[]> = {
  full_body: ['full'],
  upper_lower: ['upper', 'lower'],
  ppl: ['push', 'pull', 'legs'],
  ul_ppl: ['upper', 'lower', 'push', 'pull', 'legs'],
}

/** 分割法の日の種類を、count 日分の並びにする */
export function dayTypeSequence(split: SplitType, count: number): DayType[] {
  const cycle = CYCLES[split]
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length])
}

export function sharesMuscles(a: DayType, b: DayType): boolean {
  const mb = dayTypeMuscles(b)
  return dayTypeMuscles(a).some((m) => mb.includes(m))
}

export interface ScheduledDay { date: string; dayType: DayType }

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]]
  const out: T[][] = []
  items.forEach((x, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([x, ...rest])
  })
  return out
}

/**
 * 行ける曜日（0=日〜6=土）から、対象週（月曜始まり）の日付を選んで日の種類を並べる。
 * 同じ部位を含む日の間は48時間以上あける（設計書「1. 分割法」）。
 * 方法：行ける日から count 日を選ぶ組み合わせをすべて試し、分割法の並び順に日の種類を当てはめて
 * 48時間ルールを満たすものの中から、次の週への折り返しを含めた最小の間隔が最も大きいもの（同じなら早い日付）を選ぶ。
 * 1つもなければ日数を1日ずつ減らし、減らした理由を notes に入れる。
 */
export function scheduleDays(
  split: SplitType, weekdays: number[], weekStart: string, count: number,
): { days: ScheduledDay[]; notes: string[] } {
  const available = [...new Set(weekdays)]
    .filter((w) => w >= 0 && w <= 6)
    .map((w) => (w + 6) % 7) // 月曜からの日数
    .sort((a, b) => a - b)
  if (available.length === 0) return { days: [], notes: ['行ける曜日が選ばれていないため、メニューを組めません。'] }

  const types = dayTypeSequence(split, count)
  for (let n = Math.min(count, available.length); n >= 1; n--) {
    let best: number[] | undefined
    let bestScore = -1
    for (const combo of combinations(available, n)) {
      const ok = combo.every((a, i) =>
        combo.slice(i + 1).every((b, j) => b - a >= MIN_GAP_DAYS || !sharesMuscles(types[i], types[i + 1 + j])))
      if (!ok) continue
      const gaps = combo.map((a, i) => (i + 1 < n ? combo[i + 1] : combo[0] + 7) - a)
      const score = Math.min(...gaps)
      if (score > bestScore) { best = combo; bestScore = score }
    }
    if (!best) continue
    const days = best.map((offset, i) => ({ date: addDays(weekStart, offset), dayType: types[i] }))
    const notes: string[] = []
    if (n < count) {
      notes.push(available.length < count
        ? `行ける曜日が${available.length}日しかないため、週${count}日ではなく週${n}日で組みました。`
        : `行ける曜日の間隔が詰まっていて、同じ部位の日の間を48時間あけられないため、週${count}日ではなく週${n}日で組みました。`)
    }
    return { days, notes }
  }
  return { days: [], notes: [] } // n=1 は必ず組めるのでここには来ない
}

