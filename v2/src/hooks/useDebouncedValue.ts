import { useState, useEffect } from 'react'

/**
 * 通用 debounce hook。
 * 已核对旧版：搜索无 debounce（即时），新框架用 300ms 默认。
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
