import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

const STORAGE_PREFIX = 'kintore.collapsed.'

function loadCollapsed(key: string, defaultCollapsed: boolean): boolean {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key)
    return v === null ? defaultCollapsed : v === '1'
  } catch {
    return defaultCollapsed
  }
}

function saveCollapsed(key: string, collapsed: boolean, defaultCollapsed: boolean): void {
  try {
    if (collapsed === defaultCollapsed) localStorage.removeItem(STORAGE_PREFIX + key)
    else localStorage.setItem(STORAGE_PREFIX + key, collapsed ? '1' : '0')
  } catch {
    // 保存できなくても開け閉めはできる
  }
}

/** たたんだかどうかを端末に覚えておく。覚えていなければ defaultCollapsed */
export function usePersistentCollapsed(storageKey: string, defaultCollapsed = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(storageKey, defaultCollapsed))
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    saveCollapsed(storageKey, next, defaultCollapsed)
  }
  return [collapsed, toggle]
}

interface Props {
  /** たたんだかどうかを覚えておくための、変わらない名前 */
  storageKey: string
  /** 見出し。アイコンなどを含めてよい */
  title: ReactNode
  /** ボタンの読み上げに使う見出しの文字。title が文字だけなら省略できる */
  label?: string
  /** 見出しの要素。見出しにしたくないもの（ラベルなど）は div */
  titleAs?: 'h2' | 'div'
  titleClassName?: string
  /** 見出しの右に出すもの（リンクやボタン） */
  actions?: ReactNode
  /** false にすると、たたんでいる間は actions を出さない（幅をとるとき） */
  actionsWhenCollapsed?: boolean
  /** たたんでいる間だけ見出しの右に出す短いまとめ */
  summary?: ReactNode
  /** card に足すクラス（hero など） */
  className?: string
  /** 中身を包む要素のクラス */
  bodyClassName?: string
  /** section の読み上げ名 */
  ariaLabel?: string
  children: ReactNode
}

/** 見出しの右のボタンで、中身をたたんだり開いたりできるカード。たたんだ状態は端末に覚えておく */
export function CollapsibleCard({
  storageKey,
  title,
  label,
  titleAs: Title = 'h2',
  titleClassName = 'card-title',
  actions,
  actionsWhenCollapsed = true,
  summary,
  className = '',
  bodyClassName = 'stack',
  ariaLabel,
  children,
}: Props) {
  const [collapsed, toggle] = usePersistentCollapsed(storageKey)
  const name = label ?? (typeof title === 'string' ? title : '')
  return (
    <section className={`card collapsible ${collapsed ? 'is-collapsed' : ''} ${className}`.trim()} aria-label={ariaLabel}>
      <div className="collapsible-head">
        <Title className={`collapsible-title ${titleClassName}`.trim()}>{title}</Title>
        {collapsed && summary !== undefined && <span className="collapsible-summary">{summary}</span>}
        {(actionsWhenCollapsed || !collapsed) && actions}
        <button
          type="button"
          className="icon-btn collapse-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `「${name}」を開く` : `「${name}」をたたむ`}
          onClick={toggle}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
      {!collapsed && <div className={`collapsible-body ${bodyClassName}`.trim()}>{children}</div>}
    </section>
  )
}
