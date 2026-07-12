/**
 * 图片库首页 — 文件夹列表视图的单行（对应宫格视图的 ImageFolderCard）。
 */
import { useEffect, useState } from 'react'
import type { ImageFolder, ImageTagDef } from '@shared/types'
import { TagBadges } from './TagBadges'
import { cleanImageDisplayName } from '@/utils/cleanImageName'

interface ImageFolderRowProps {
  folderPath: string
  meta: ImageFolder | null
  isPinned: boolean
  isWatched: boolean
  tagDefs: ImageTagDef[]
  showOriginalName: boolean
  onEnter: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selectMode?: boolean
  isSelected?: boolean
  onSelectToggle?: () => void
  even?: boolean
  onCoverResolved?: () => void
}

export function ImageFolderRow({
  folderPath, meta, isPinned, isWatched, tagDefs, showOriginalName,
  onEnter, onContextMenu, selectMode, isSelected, onSelectToggle, even, onCoverResolved,
}: ImageFolderRowProps) {
  const [coverHash, setCoverHash] = useState<string | null>(meta?.cover || null)
  const rawName = meta?.name || folderPath.split(/[\\/]/).pop() || folderPath
  const displayName = showOriginalName ? rawName : cleanImageDisplayName(rawName)

  useEffect(() => {
    if (coverHash) { onCoverResolved?.(); return }
    let cancelled = false
    window.api.imageGetFolderCover(folderPath).then(hash => {
      if (!cancelled) { setCoverHash(hash); onCoverResolved?.() }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath])

  function handleClick() {
    if (selectMode && onSelectToggle) { onSelectToggle(); return }
    onEnter()
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer select-none"
      style={{ backgroundColor: even ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--kq-row-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = even ? 'var(--kq-row-even)' : 'var(--kq-row-odd)')}
    >
      {selectMode ? (
        <div
          className="w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ backgroundColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)', color: isSelected ? '#fff' : 'transparent' }}
        >{isSelected ? '✓' : ''}</div>
      ) : isPinned ? (
        <span className="shrink-0 text-xs" style={{ color: 'var(--kq-border-pin)' }}>📌</span>
      ) : (
        <span className="w-3 shrink-0" />
      )}

      <div className="w-9 h-9 rounded overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
        {coverHash
          ? <img src={`kiroq://thumbnail/${coverHash}`} className="w-full h-full object-cover" />
          : <span className="text-sm">📖</span>}
      </div>

      {isWatched && <span className="text-[10px] shrink-0" style={{ color: '#88cc88' }}>✓已看</span>}

      <span className="flex-1 text-xs truncate" style={{ color: 'var(--kq-text-primary)' }}>
        {displayName}
      </span>

      <TagBadges tagIds={meta?.tags || []} allDefs={tagDefs} maxVisible={3} inline />
    </div>
  )
}
