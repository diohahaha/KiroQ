/**
 * 图片文件夹卡片 — 结构照抄 AnimeCard.tsx，封面/角标逻辑替换为图片库版本。
 */
import { useCallback, useEffect, useRef, useState, forwardRef } from 'react'
import { motion } from 'framer-motion'
import type { ImageFolder, ImageTagDef } from '@shared/types'
import { TagBadges, WatchedBadge } from './TagBadges'
import { cleanImageDisplayName } from '@/utils/cleanImageName'

interface ImageFolderCardProps {
  folderPath: string
  meta: ImageFolder | null
  isPinned: boolean
  isHidden: boolean
  isWatched: boolean
  tagDefs: ImageTagDef[]
  showOriginalName: boolean
  onEnter: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selectMode?: boolean
  isSelected?: boolean
  onSelectToggle?: () => void
  enableAnimation?: boolean
  /** 封面尝试完成时触发一次（不管是拿到图还是确认没有），用于首页整体加载进度统计 */
  onCoverResolved?: () => void
  /** 卡片宽度(px)，配合缩放滑条使用，默认 160 */
  size?: number
}

export const ImageFolderCard = forwardRef<HTMLDivElement, ImageFolderCardProps>(function ImageFolderCard({
  folderPath, meta, isPinned, isHidden, isWatched, tagDefs, showOriginalName,
  onEnter, onContextMenu,
  selectMode, isSelected, onSelectToggle,
  enableAnimation = true,
  onCoverResolved,
  size = 160,
}, ref) {
  const [coverHash, setCoverHash] = useState<string | null>(meta?.cover || null)
  const rawName = meta?.name || folderPath.split(/[\\/]/).pop() || folderPath
  const displayName = showOriginalName ? rawName : cleanImageDisplayName(rawName)
  const resolvedRef = useRef(false)
  // 封面区比整卡窄 6px（左右各留 3px），高度按原比例 154:200 换算，标题+边距估算 50px
  const coverW = size - 6
  const coverH = Math.round(coverW * (200 / 154))
  const cardMinHeight = coverH + 56

  useEffect(() => {
    if (coverHash) {
      if (!resolvedRef.current) { resolvedRef.current = true; onCoverResolved?.() }
      return
    }
    let cancelled = false
    window.api.imageGetFolderCover(folderPath).then(hash => {
      if (cancelled) return
      if (hash) setCoverHash(hash)
      if (!resolvedRef.current) { resolvedRef.current = true; onCoverResolved?.() }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath])

  const handleClick = useCallback(() => {
    if (selectMode && onSelectToggle) { onSelectToggle(); return }
    onEnter()
  }, [selectMode, onSelectToggle, onEnter])

  const content = (
    <div
      className="relative rounded-lg border cursor-pointer transition-colors duration-150 flex flex-col select-none"
      style={{
        backgroundColor: isHidden ? 'var(--kq-hidden-card)' : 'var(--kq-bg-card)',
        borderColor: isSelected ? 'var(--kq-accent)' : isPinned ? 'var(--kq-border-pin)' : 'var(--kq-border)',
        borderWidth: isSelected ? 2 : 1,
        width: size, minHeight: cardMinHeight,
      }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--kq-border-hover)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = isPinned ? 'var(--kq-border-pin)' : 'var(--kq-border)' }}
    >
      {selectMode && (
        <div
          className="absolute top-1 right-1 w-[22px] h-[22px] rounded flex items-center justify-center text-xs font-bold z-20"
          style={{ backgroundColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)', color: isSelected ? '#fff' : 'transparent' }}
        >
          {isSelected ? '✓' : ''}
        </div>
      )}

      <WatchedBadge watched={isWatched} />

      <div className="relative mx-[3px] mt-[6px] rounded-lg overflow-hidden" style={{ width: coverW, height: coverH }}>
        {coverHash ? (
          <img
            src={`kiroq://thumbnail/${coverHash}`}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--kq-bg-nav)', fontSize: Math.max(coverW * 0.22, 20) }}>📖</div>
        )}
        <TagBadges tagIds={meta?.tags || []} allDefs={tagDefs} />
      </div>

      <div className="px-[5px] pt-[4px] text-xs text-center leading-tight flex-1 flex items-center justify-center"
        style={{ color: 'var(--kq-text-primary)' }}>
        {displayName}
      </div>
    </div>
  )

  return (
    <motion.div ref={ref} initial={false} animate={{}}
      exit={enableAnimation ? { opacity: 0, scale: 0.95 } : undefined}
      transition={{ duration: 0.15 }}>
      {content}
    </motion.div>
  )
})
