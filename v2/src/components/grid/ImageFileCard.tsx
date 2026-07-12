/**
 * 图片库详情页 — 单个资源文件卡片（宫格视图）。
 * kind='ebook' 且没有封面时用 📖 占位；其余同 ImageFolderCard 的封面加载模式。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ImageResourceKind, ImageTagDef } from '@shared/types'
import { TagBadges, WatchedBadge } from './TagBadges'

interface ImageFileCardProps {
  filePath: string
  fileName: string
  kind: ImageResourceKind
  isWatched: boolean
  tagIds: string[]
  tagDefs: ImageTagDef[]
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selectMode?: boolean
  isSelected?: boolean
  onSelectToggle?: () => void
  onCoverResolved?: () => void
  /** 卡片宽度(px)，配合缩放滑条使用，默认 140 */
  size?: number
}

const KIND_ICON: Record<ImageResourceKind, string> = {
  image: '🖼️',
  archive: '📦',
  ebook: '📖',
  video: '🎬',
  other: '📄',
}

export function ImageFileCard({
  filePath, fileName, kind, isWatched, tagIds, tagDefs,
  onOpen, onContextMenu, selectMode, isSelected, onSelectToggle, onCoverResolved,
  size = 140,
}: ImageFileCardProps) {
  const [coverHash, setCoverHash] = useState<string | null>(null)
  const coverW = size - 6
  const coverH = Math.round(coverW * (170 / 134))
  const cardMinHeight = coverH + 46

  useEffect(() => {
    let cancelled = false
    window.api.imageGetCover(filePath).then(hash => {
      if (cancelled) return
      setCoverHash(hash)
      onCoverResolved?.()
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  const handleClick = useCallback(() => {
    if (selectMode && onSelectToggle) { onSelectToggle(); return }
    onOpen()
  }, [selectMode, onSelectToggle, onOpen])

  return (
    <div
      className="relative rounded-lg border cursor-pointer transition-colors duration-150 flex flex-col select-none"
      style={{
        backgroundColor: 'var(--kq-bg-card)',
        borderColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-border)',
        borderWidth: isSelected ? 2 : 1,
        width: size, minHeight: cardMinHeight,
      }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--kq-border-hover)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--kq-border)' }}
    >
      {selectMode && (
        <div
          className="absolute top-1 right-1 w-[20px] h-[20px] rounded flex items-center justify-center text-xs font-bold z-20"
          style={{ backgroundColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)', color: isSelected ? '#fff' : 'transparent' }}
        >
          {isSelected ? '✓' : ''}
        </div>
      )}

      <WatchedBadge watched={isWatched} />

      <div className="relative mx-[3px] mt-[6px] rounded-lg overflow-hidden" style={{ width: coverW, height: coverH }}>
        {coverHash ? (
          <img src={`kiroq://thumbnail/${coverHash}`} alt={fileName} className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--kq-bg-nav)', fontSize: Math.max(coverW * 0.22, 18) }}>{KIND_ICON[kind]}</div>
        )}
        <TagBadges tagIds={tagIds} allDefs={tagDefs} />
      </div>

      <div className="px-[4px] pt-[4px] text-[11px] text-center leading-tight flex-1 flex items-center justify-center break-all"
        style={{ color: 'var(--kq-text-primary)' }}>
        {fileName}
      </div>
    </div>
  )
}
