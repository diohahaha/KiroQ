/**
 * 通用筛选下拉面板——点击按钮展开一个面板，点击外部自动收起。
 * 具体筛选控件（类型/已看/标签/自动过滤等）由调用方通过 children 传入，
 * 这个组件只负责"按钮 + 面板 + 点外面关闭"这套交互壳。
 */
import { useEffect, useRef, useState } from 'react'

interface FilterPopoverProps {
  active: boolean // 当前是否有筛选条件在生效，用于按钮上显示一个小圆点提示
  children: React.ReactNode
}

export function FilterPopover({ active, children }: FilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center gap-1 px-2.5 py-1 text-xs rounded border"
        style={{
          borderColor: open ? 'var(--kq-accent)' : 'var(--kq-border)',
          backgroundColor: open ? 'var(--kq-accent)' : 'var(--kq-bg-card)',
          color: open ? '#fff' : 'var(--kq-text-primary)',
        }}
      >
        🔍 筛选
        {active && !open && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--kq-accent)' }} />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 p-3 rounded-lg shadow-lg z-40 w-[280px] space-y-3"
          style={{ backgroundColor: 'var(--kq-bg-card)', border: '1px solid var(--kq-border)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
