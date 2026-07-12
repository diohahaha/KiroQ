/**
 * 图片库详情页 — 单个资源文件行（列表视图）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ImageResourceKind, ImageTagDef } from '@shared/types'
import { TagBadges } from './TagBadges'

interface ImageFileRowProps {
  filePath: string
  fileName: string
  kind: ImageResourceKind
  isWatched: boolean
  tagIds: string[]
  tagDefs: ImageTagDef[]
  lastOpened?: number
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selectMode?: boolean
  isSelected?: boolean
  onSelectToggle?: () => void
  even?: boolean
  onCoverResolved?: () => void
}

const KIND_ICON: Record<ImageResourceKind, string> = { image: '🖼️', archive: '📦', ebook: '📖', video: '🎬', other: '📄' }

function formatAgo(ts?: number): string | null {
  if (!ts) return null
  const diffMs = Date.now() - ts
  const days = Math.floor(diffMs / 86400000)
  if (days <= 0) return '今天打开过'
  if (days === 1) return '昨天打开过'
  if (days < 30) return `${days}天前打开过`
  const months = Math.floor(days / 30)
  return `${months}个月前打开过`
}

export function ImageFileRow({
  filePath, fileName, kind, isWatched, tagIds, tagDefs, lastOpened,
  onOpen, onContextMenu, selectMode, isSelected, onSelectToggle, even, onCoverResolved,
}: ImageFileRowProps) {
  const [coverHash, setCoverHash] = useState<string | null>(null)

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

  const agoText = formatAgo(lastOpened)

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer select-none"
      style={{ backgroundColor: even ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
      onClick={handleClick}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--kq-row-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = even ? 'var(--kq-row-even)' : 'var(--kq-row-odd)')}
    >
      {selectMode ? (
        <div
          className="w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ backgroundColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)', color: isSelected ? '#fff' : 'transparent' }}
        >{isSelected ? '✓' : ''}</div>
      ) : (
        <span className="shrink-0" style={{ color: isWatched ? '#88cc88' : 'var(--kq-unwatched-text)' }}>●</span>
      )}

      <div className="w-8 h-8 rounded overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
        {coverHash
          ? <img src={`kiroq://thumbnail/${coverHash}`} className="w-full h-full object-cover" />
          : <span className="text-sm">{KIND_ICON[kind]}</span>}
      </div>

      <span className="flex-1 text-xs truncate" style={{ color: isWatched ? 'var(--kq-watched-text)' : 'var(--kq-text-primary)' }}>
        {fileName}
      </span>

      {agoText && <span className="text-[10px] shrink-0" style={{ color: 'var(--kq-text-dim)' }}>{agoText}</span>}

      <TagBadges tagIds={tagIds} allDefs={tagDefs} maxVisible={3} inline />
    </div>
  )
}
