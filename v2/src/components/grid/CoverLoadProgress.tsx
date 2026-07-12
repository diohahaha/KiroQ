/**
 * 封面加载进度提示——文件夹/文件数量多、尤其是压缩包多的时候，封面是排队慢慢生成的
 * （见 electron/services/taskQueue.ts 的并发限流），不会瞬间全部出现。加个进度条告诉
 * 用户"现在加载到哪了"，而不是让人以为卡住了。全部加载完自动消失。
 */
interface CoverLoadProgressProps {
  done: number
  total: number
}

export function CoverLoadProgress({ done, total }: CoverLoadProgressProps) {
  if (total === 0 || done >= total) return null
  const pct = Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs shrink-0 border-b"
      style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-dim)' }}>
      <span>🖼️ 正在生成封面 {done}/{total}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--kq-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--kq-accent)' }} />
      </div>
    </div>
  )
}
