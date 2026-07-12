/**
 * 悬浮缩放滑条——固定在滚动容器右下角，配合 useScrollReveal 使用：平时透明、
 * 不可点击，滚轮滚动时淡入，停止操作一段时间后自动淡出收起。
 * 需要放在 position: relative 的容器里，自身用 absolute 定位。
 */
interface ZoomSliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  visible: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export function ZoomSlider({ value, min, max, step = 10, onChange, visible, onMouseEnter, onMouseLeave }: ZoomSliderProps) {
  return (
    <div
      className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-opacity duration-300 z-30"
      style={{
        backgroundColor: 'var(--kq-bg-card)',
        border: '1px solid var(--kq-border)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="text-xs select-none" style={{ color: 'var(--kq-text-dim)' }}>🔍</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-24 cursor-pointer"
        style={{ accentColor: 'var(--kq-accent)' }}
      />
      <span className="text-[10px] w-7 text-right select-none" style={{ color: 'var(--kq-text-dim)' }}>{value}</span>
    </div>
  )
}
