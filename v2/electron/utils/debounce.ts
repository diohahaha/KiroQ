/**
 * 通用防抖函数，返回带 flush 能力的包装函数。
 * 已核对旧版 DataManager：500ms 防抖 + flush() 立即写入。
 */

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): T & { flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null

  const wrapped = (...args: Parameters<T>) => {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }

  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      if (lastArgs) fn(...lastArgs)
    }
  }

  return wrapped as T & { flush: () => void }
}
