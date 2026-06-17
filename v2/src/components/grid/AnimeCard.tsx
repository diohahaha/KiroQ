/**
 * 番剧文件夹卡片 — 封面 + 标题 + 进度条 + 状态标签
 * 已核对旧版 ui/grid.py AnimeCard
 */
import { useCallback, forwardRef } from 'react'
import { motion } from 'framer-motion'
import type { AnimeFolder } from '@shared/types'

interface AnimeCardProps {
  folderPath: string
  displayName: string
  meta: AnimeFolder | null
  isPinned: boolean
  isHidden: boolean
  watchedCount: number
  totalVideos: number
  onEnter: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selectMode?: boolean
  isSelected?: boolean
  onSelectToggle?: () => void
  /** 是否启用 layout 动画（默认 true） */
  enableAnimation?: boolean
}

const STATUS_EMOJI: Record<string, string> = {
  watching: '📺', want: '🔖', done: '✅', paused: '⏸',
}

export const AnimeCard = forwardRef<HTMLDivElement, AnimeCardProps>(function AnimeCard({
  displayName, meta, isPinned, isHidden,
  watchedCount, totalVideos,
  onEnter, onContextMenu,
  selectMode, isSelected, onSelectToggle,
  enableAnimation = true,
}, ref) {
  const handleClick = useCallback(() => {
    if (selectMode && onSelectToggle) { onSelectToggle(); return }
    onEnter()
  }, [selectMode, onSelectToggle, onEnter])

  const ratio = totalVideos > 0 ? Math.min(watchedCount / totalVideos, 1) : 0

  const content = (
    <div
      ref={undefined}
      className="relative rounded-lg border cursor-pointer transition-colors duration-150 flex flex-col select-none"
      style={{
        backgroundColor: isHidden ? 'var(--kq-hidden-card)' : 'var(--kq-bg-card)',
        borderColor: isSelected ? 'var(--kq-accent)' : isPinned ? 'var(--kq-border-pin)' : 'var(--kq-border)',
        borderWidth: isSelected ? 2 : 1,
        width: 160, minHeight: 270,
      }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--kq-border-hover)'
      }}
      onMouseLeave={e => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = isPinned ? 'var(--kq-border-pin)' : 'var(--kq-border)'
        }
      }}
    >
      {/* 选择框（多选模式，相对于卡片定位） */}
      {selectMode && (
        <div
          className="absolute top-1 left-1 w-[22px] h-[22px] rounded flex items-center justify-center text-xs font-bold z-10"
          style={{
            backgroundColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)',
            color: isSelected ? '#fff' : 'transparent',
          }}
        >
          {isSelected ? '✓' : ''}
        </div>
      )}

      {/* 封面 */}
      <div className="relative mx-[3px] mt-[6px] rounded-lg overflow-hidden" style={{ width: 154, height: 200 }}>
        {meta?.cover ? (
          <img src={`kiroq://cover/${meta.cover}`} alt={displayName}
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl"
            style={{ backgroundColor: 'var(--kq-bg-nav)' }}>🎬</div>
        )}
        {/* 评分角标 — 右下角 */}
        {meta?.rating != null && meta.rating > 0 && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] rounded font-medium"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#ffcc00' }}>
            ⭐{meta.rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* 进度条 — 有真实数据时显示 */}
      {totalVideos > 0 && watchedCount > 0 && (
        <div className="mx-[6px] mt-[3px] h-[3px] rounded-full" style={{ backgroundColor: 'var(--kq-border)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${ratio * 100}%`, backgroundColor: ratio >= 1 ? 'var(--kq-watched-fg)' : 'var(--kq-accent)' }} />
        </div>
      )}

      {/* 标题 */}
      <div className="px-[5px] pt-[4px] text-xs text-center leading-tight flex-1 flex items-center justify-center"
        style={{ color: watchedCount > 0 ? 'var(--kq-watched-text)' : 'var(--kq-text-primary)' }}>
        {displayName}
      </div>

      {/* 状态标签 */}
      <div className="flex items-center px-[6px] pb-[4px]">
        {meta?.status && STATUS_EMOJI[meta.status] ? (
          <span className="text-[11px]">{STATUS_EMOJI[meta.status]}</span>
        ) : <span />}
      </div>
    </div>
  )

  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{}}
      exit={enableAnimation ? { opacity: 0, scale: 0.95 } : undefined}
      transition={{ duration: 0.15 }}
    >
      {content}
    </motion.div>
  )
})
