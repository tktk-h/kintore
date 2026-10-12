import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackup, Download, Info, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { useSafeAction, useToast } from '../../components/Toast'
import { DEFAULT_SETTINGS } from '../../db/types'
import { backupFileName, exportBackup, importBackup, parseBackup, readFileText, shareOrDownload } from '../../lib/backup'
import { APP_VERSION, BUILD_TIME, COMMIT, formatBuildTime } from '../../lib/version'
import { getSettings, saveSettings } from '../../repo/settings'

const WEIGHT_STEPS = [0.5, 1, 1.25, 2.5, 5]
const REP_STEPS = [1, 2, 5]

export function SettingsPage() {
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const run = useSafeAction()
  const toast = useToast()
  const [usage, setUsage] = useState<string>()

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then(({ usage: used = 0, quota = 0 }) => setUsage(`${(used / 1024 / 1024).toFixed(1)}MB 使用中（上限の${quota ? Math.round((used / quota) * 100) : 0}%）`))
      .catch(() => {})
  }, [])

  const exportData = () =>
    run(async () => {
      const backup = await exportBackup()
      await shareOrDownload(backupFileName(), JSON.stringify(backup))
    }, 'バックアップを書き出せませんでした')

  const importData = async (file: File | undefined) => {
    if (!file) return
    await run(async () => {
      const backup = parseBackup(await readFileText(file))
      if (!window.confirm('今のデータはすべてバックアップの内容に置き換わります。よろしいですか？')) return
      await importBackup(backup)
      toast('バックアップから復元しました')
    }, '読み込めませんでした')
  }

  return (
    <div className="page">
      <h1>設定</h1>
      <CollapsibleCard
        storageKey="settings.input"
        label="入力"
        title={
          <>
            <SlidersHorizontal aria-hidden="true" />
            入力
          </>
        }
      >
        <label className="field">
          重量の刻み幅
          <select value={settings.weightStep} onChange={(e) => run(() => saveSettings({ weightStep: Number(e.target.value) }))}>
            {WEIGHT_STEPS.map((s) => (
              <option key={s} value={s}>
                {s}kg
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          回数の刻み幅
          <select value={settings.repStep} onChange={(e) => run(() => saveSettings({ repStep: Number(e.target.value) }))}>
            {REP_STEPS.map((s) => (
              <option key={s} value={s}>
                {s}回
              </option>
            ))}
          </select>
        </label>
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="settings.backup"
        label="バックアップ"
        title={
          <>
            <DatabaseBackup aria-hidden="true" />
            バックアップ
          </>
        }
      >
        <p className="muted">データはこのiPhoneの中にだけ保存されています。機種変更に備えて、ときどき書き出してください。</p>
        {usage && <p className="muted">{usage}</p>}
        <button type="button" className="btn btn-primary btn-block" onClick={exportData}>
          <Download aria-hidden="true" />
          バックアップを書き出す
        </button>
        <label className="field">
          バックアップを読み込む
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void importData(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="settings.about"
        label="アプリについて"
        summary={`v${APP_VERSION}`}
        bodyClassName="stack-sm"
        title={
          <>
            <Info aria-hidden="true" />
            アプリについて
          </>
        }
      >
        <p>バージョン {APP_VERSION}</p>
        <p className="muted">更新 {formatBuildTime(BUILD_TIME)}</p>
        {COMMIT && <p className="muted">コミット {COMMIT}</p>}
      </CollapsibleCard>
    </div>
  )
}
