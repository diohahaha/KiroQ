/**
 * 标题栏：保留系统原生标题栏（不做无边框），此处只显示应用名。
 * 对应旧版 window title "KiroQ v1.1.0"
 */
export function TitleBar() {
  return (
    <div
      className="flex items-center px-4 h-8 border-b shrink-0 select-none"
      style={{
        backgroundColor: 'var(--kq-bg-nav)',
        borderColor: 'var(--kq-border)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <span
        className="text-xs font-medium"
        style={{ color: 'var(--kq-text-dim)' }}
      >
        KiroQ v2.0
      </span>
    </div>
  )
}
