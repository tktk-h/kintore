/** ビルドしたときに vite.config.ts の define で埋め込まれる値 */
export const APP_VERSION: string = __APP_VERSION__
/** ビルドした日時（ISO 形式） */
export const BUILD_TIME: string = __BUILD_TIME__
/** ビルドした git のコミット（短い形）。分からなければ空 */
export const COMMIT: string = __COMMIT__

const pad = (n: number) => String(n).padStart(2, '0')

function parse(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 2026/10/13 14:05（端末の時刻で） */
export function formatBuildTime(iso: string): string {
  const d = parse(iso)
  return d ? `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}

/** 10/13 14:05 */
export function formatBuildTimeShort(iso: string): string {
  const d = parse(iso)
  return d ? `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}

/** v0.2.0 ・ 10/13 14:05 更新 */
export function versionLine(version: string, iso: string): string {
  const time = formatBuildTimeShort(iso)
  return time ? `v${version} ・ ${time} 更新` : `v${version}`
}
