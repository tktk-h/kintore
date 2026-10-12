import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 3000)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="alert">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/**
 * 保存処理を実行し、失敗したらトーストで知らせる。成功したら true。
 * 失敗時は false を返すので、呼び出し側は入力内容を消さずに残せる。
 */
export function useSafeAction() {
  const toast = useToast()
  return useCallback(
    async (action: () => Promise<unknown>, failMessage = '保存できませんでした。もう一度試してください'): Promise<boolean> => {
      try {
        await action()
        return true
      } catch (e) {
        console.error(e)
        toast(e instanceof Error && e.message ? `${failMessage}（${e.message}）` : failMessage)
        return false
      }
    },
    [toast],
  )
}
