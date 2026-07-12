import { useCallback, useRef, useState } from 'react'

/**
 * 滚轮滚动时"浮出"、停止操作一段时间后自动收起——用于缩放滑条这种平时不占地方、
 * 用的时候才出现的控件。鼠标悬停在控件本身上时不会被计时器收起（cancelHide），
 * 移开鼠标后重新开始倒计时（reveal，效果等同于重新触发一次"刚滚动过"）。
 */
export function useScrollReveal(hideDelay = 1500) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reveal = useCallback(() => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), hideDelay)
  }, [hideDelay])

  const cancelHide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { visible, onWheel: reveal, onMouseEnter: cancelHide, onMouseLeave: reveal }
}
