import { useState, useCallback } from 'react'

/**
 * 薄封装：把 window.api 调用包一层 try/catch + loading 状态。
 */
export function useIpc<T extends (...args: any[]) => Promise<any>>(fn: T) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const call = useCallback(
    async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = await fn(...args)
        return result
      } catch (e) {
        setError(String(e))
        return null
      } finally {
        setLoading(false)
      }
    },
    [fn],
  )

  return { call, loading, error }
}
