import { useLiveQuery } from 'dexie-react-hooks'
import { Check, DatabaseBackup, Download, Info, SlidersHorizontal, Sparkles, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { useSafeAction, useToast } from '../../components/Toast'
import { DEFAULT_SETTINGS } from '../../db/types'
import { backupFileName, exportBackup, importBackup, parseBackup, readFileText, shareOrDownload } from '../../lib/backup'
import { APP_VERSION, BUILD_TIME, COMMIT, formatBuildTime } from '../../lib/version'
import { clearChat } from '../../repo/chat'
import { getSettings, saveSettings } from '../../repo/settings'

const WEIGHT_STEPS = [0.5, 1, 1.25, 2.5, 5]
const REP_STEPS = [1, 2, 5]

export function SettingsPage() {
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const run = useSafeAction()
  const toast = useToast()
  const [usage, setUsage] = useState<string>()
  const [passcode, setPasscode] = useState('')

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

  const savePasscode = async () => {
    const value = passcode.trim()
    if (!value) return
    if (await run(() => saveSettings({ coachPasscode: value }))) {
      setPasscode('')
      toast('合言葉を保存しました')
    }
  }

  const deleteChat = async () => {
    if (!window.confirm('AIコーチとのチャット履歴をすべて消しますか？（反映済みの予定は残ります）')) return
    if (await run(clearChat, '消せませんでした')) toast('チャット履歴を消しました')
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
        storageKey="settings.coach"
        label="AIコーチ"
        summary={settings.coachPasscode ? '設定済み' : '合言葉が未設定'}
        title={
          <>
            <Sparkles aria-hidden="true" />
            AIコーチ
          </>
        }
      >
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault()
            void savePasscode()
          }}
        >
          <span className="row between">
            <label htmlFor="coach-passcode">合言葉</label>
            {settings.coachPasscode && (
              <span className="done-line passcode-set">
                <Check aria-hidden="true" />
                設定済み
              </span>
            )}
          </span>
          <span className="passcode-row">
            <input
              id="coach-passcode"
              type="password"
              autoComplete="off"
              placeholder={settings.coachPasscode ? '変えるときだけ入力' : 'サーバーに設定した合言葉'}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
            <button type="submit" className="btn" aria-label="合言葉を保存" disabled={!passcode.trim()}>
              保存
            </button>
          </span>
        </form>
        <Link className="btn btn-block" to="/coach/profile">
          <UserRound aria-hidden="true" />
          プロフィールを編集
        </Link>
        <button type="button" className="btn btn-danger btn-block" onClick={() => void deleteChat()}>
          <Trash2 aria-hidden="true" />
          チャット履歴を消す
        </button>
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
