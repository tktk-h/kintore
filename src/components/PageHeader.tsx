import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

interface Props {
  title: ReactNode
  eyebrow?: string
  /** 履歴がないとき（直接URLを開いたとき）の戻り先。指定しなければ戻るボタンを出さない */
  backTo?: string
}

/** 戻るボタン付きのページ見出し。タブの直下のページでは backTo を渡さない */
export function PageHeader({ title, eyebrow, backTo }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(backTo ?? '/', { replace: true })
  }
  return (
    <>
      {backTo !== undefined && (
        <button type="button" className="back-btn" aria-label="戻る" onClick={goBack}>
          <ChevronLeft aria-hidden="true" />
          戻る
        </button>
      )}
      <header className="page-title">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </header>
    </>
  )
}
