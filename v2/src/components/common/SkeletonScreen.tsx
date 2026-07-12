/**
 * 冷启动骨架屏——软件刚打开、数据还没从磁盘读完那一下（正常情况，不是 bug，
 * 只是读文件需要一点时间），之前是直接白屏等，现在显示一个占位骨架，
 * 用 Tailwind 的 animate-pulse 做呼吸闪烁效果，体感上不会觉得"卡住了"。
 */
export function SkeletonScreen() {
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--kq-bg-detail, #12121e)' }}>
      {/* 导航栏骨架 */}
      <div className="flex items-center px-3 h-[52px] border-b shrink-0 gap-2"
        style={{ backgroundColor: 'var(--kq-bg-nav, #1a1a2e)', borderColor: 'var(--kq-border, #2a2a4a)' }}>
        <div className="w-16 h-6 rounded animate-pulse" style={{ backgroundColor: 'var(--kq-border, #2a2a4a)' }} />
        <div className="flex-1" />
        <div className="w-[180px] h-7 rounded-md animate-pulse" style={{ backgroundColor: 'var(--kq-border, #2a2a4a)' }} />
        <div className="w-7 h-7 rounded animate-pulse" style={{ backgroundColor: 'var(--kq-border, #2a2a4a)' }} />
        <div className="w-20 h-7 rounded-md animate-pulse" style={{ backgroundColor: 'var(--kq-border, #2a2a4a)' }} />
      </div>

      {/* 工具栏骨架 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--kq-border, #2a2a4a)' }}>
        {[60, 70, 90, 100].map((w, i) => (
          <div key={i} className="h-6 rounded animate-pulse" style={{ width: w, backgroundColor: 'var(--kq-border, #2a2a4a)' }} />
        ))}
      </div>

      {/* 卡片宫格骨架 */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="rounded-lg animate-pulse" style={{
              width: 160, height: 270,
              backgroundColor: 'var(--kq-bg-card, #1e1e2e)',
              animationDelay: `${(i % 6) * 80}ms`,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}
