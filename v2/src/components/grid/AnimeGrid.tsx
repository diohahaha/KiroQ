/**
 * 番剧宫格 — 虚拟滚动版本，文件夹 + 根目录散装视频合并进同一个连续滚动列表。
 *
 * 宫格模式：两个独立 VirtualGrid（文件夹大卡片 + 视频小卡片）叠在同一个
 * overflow-y-auto 容器里，中间分隔线，一根滚动条打通。
 * 列表模式：文件夹和视频合并成一个 VirtualList，中间分隔行。
 */
import { useCallback, useState, useRef, useMemo } from 'react'
import { AnimeCard } from './AnimeCard'
import { RootVideoCard, getRootVideoCardHeight } from './RootVideoCard'
import { RootVideoRow } from './RootVideoRow'
import { VirtualGrid } from './VirtualGrid'
import { VirtualList } from './VirtualList'
import { ZoomSlider } from '@/components/common/ZoomSlider'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { useSettingsStore } from '@/state/settingsStore'
import type { AppData } from '@shared/types'
import { joinPath } from '@/utils/path'
import { cleanDisplayName } from '@/utils/cleanName'

type GridItem =
  | { kind: 'folder'; name: string }
  | { kind: 'video'; name: string }

interface AnimeGridProps {
  rootPath: string
  dirNames: string[]
  videoNames: string[]
  data: AppData
  videoCounts?: Record<string, number>
  cleanDisplay: boolean
  viewMode: 'grid' | 'list'
  onEnter: (folderPath: string, name: string) => void
  onContextMenu: (e: React.MouseEvent, folderPath: string, displayName: string) => void
  onVideoOpen: (videoName: string) => void
  onVideoContextMenu: (e: React.MouseEvent, videoName: string) => void
  selectMode?: boolean
  selectedPaths?: Set<string>
  onSelectToggle?: (path: string) => void
}

export function AnimeGrid(p: AnimeGridProps) {
  const [cardSize, setCardSize] = useState(() => useSettingsStore.getState().videoLibraryCardSize)
  const saveSizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollReveal = useScrollReveal()

  // 精确算文件夹 VirtualGrid 高度，让 Grid 内部无溢出 → 滚轮穿透到外层
  const handleCardSizeChange = useCallback((v: number) => {
    setCardSize(v)
    if (saveSizeTimer.current) clearTimeout(saveSizeTimer.current)
    saveSizeTimer.current = setTimeout(() => {
      useSettingsStore.getState().save({ videoLibraryCardSize: v })
    }, 300)
  }, [])

  // 文件夹/视频数据（必须放前面，后面的 hasFolders 等依赖它们）
  const folderItems: GridItem[] = useMemo(() =>
    p.dirNames.map(name => ({ kind: 'folder' as const, name })),
    [p.dirNames])
  const videoItems: GridItem[] = useMemo(() =>
    p.videoNames.map(name => ({ kind: 'video' as const, name })),
    [p.videoNames])

  const hasFolders = folderItems.length > 0
  const hasVideos = videoItems.length > 0
  const folderCoverW = cardSize - 6
  const folderCoverH = Math.round(folderCoverW * (200 / 154))
  const folderCardHeight = folderCoverH + 70
  const videoCardHeight = getRootVideoCardHeight(cardSize)

  // 列表模式：所有 item 合并（分隔符插中间）
  const listItems: GridItem[] = useMemo(() => {
    const result: GridItem[] = [...folderItems]
    if (folderItems.length > 0 && videoItems.length > 0) {
      result.push({ kind: 'separator' })
    }
    result.push(...videoItems)
    return result
  }, [folderItems, videoItems])

  const itemKey = useCallback((item: GridItem) =>
    item.kind === 'folder' ? `f:${joinPath(p.rootPath, item.name)}` : `v:${joinPath(p.rootPath, item.name)}`,
    [p.rootPath])

  const rootWatchedVideos = p.data.watched[p.rootPath] || []

  // ── 宫格：文件夹 + 视频，分隔符由 VirtualGrid.separatorAfter 处理 ──
  const gridItems: GridItem[] = useMemo(() => [...folderItems, ...videoItems], [folderItems, videoItems])

  const renderItemGrid = useCallback((item: GridItem) => {
    if (item.kind === 'folder') {
      const d = item.name
      const fp = joinPath(p.rootPath, d)
      const meta = p.data.folderMeta[fp] || null
      const wl = p.data.watched[fp] || []
      const total = p.videoCounts?.[fp] ?? 0
      // 文件夹卡片居中
      return (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <AnimeCard
            folderPath={fp}
            displayName={meta?.name || (p.cleanDisplay ? cleanDisplayName(d) : d)}
            meta={meta}
            isPinned={p.data.pinned.includes(fp)}
            isHidden={p.data.hidden.includes(fp)}
            watchedCount={wl.length} totalVideos={total}
            onEnter={() => p.onEnter(fp, meta?.name || d)}
            onContextMenu={e => p.onContextMenu(e, fp, meta?.name || d)}
            selectMode={p.selectMode} isSelected={p.selectedPaths?.has(fp)}
            onSelectToggle={p.onSelectToggle ? () => p.onSelectToggle!(fp) : undefined}
            enableAnimation={false}
            size={cardSize}
          />
        </div>
      )
    }
    // 视频卡片左对齐
    const vp = joinPath(p.rootPath, item.name)
    return (
      <RootVideoCard
        fileName={item.name}
        filePath={vp}
        isWatched={rootWatchedVideos.includes(vp)}
        durationSec={p.data.videoDurations[vp]}
        onOpen={() => p.onVideoOpen(item.name)}
        onContextMenu={e => p.onVideoContextMenu(e, item.name)}
        size={cardSize}
        selectMode={p.selectMode}
        isSelected={p.selectedPaths?.has(vp)}
        onSelectToggle={p.onSelectToggle ? () => p.onSelectToggle!(vp) : undefined}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, cardSize, rootWatchedVideos])

  // ── 列表 ──
  const renderItemList = useCallback((item: GridItem, i: number) => {
    if (item.kind === 'separator') {
      return (
        <div className="flex items-center px-3 py-1.5" style={{ backgroundColor: 'var(--kq-bg-toolbar)' }}>
          <span className="text-[11px] font-medium" style={{ color: 'var(--kq-text-dim)' }}>
            ── 📺 根目录视频 ──
          </span>
        </div>
      )
    }
    if (item.kind === 'folder') {
      const d = item.name
      const fp = joinPath(p.rootPath, d)
      const meta = p.data.folderMeta[fp] || null
      return (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer select-none"
          style={{ backgroundColor: i % 2 === 0 ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
          onClick={() => { if (p.selectMode && p.onSelectToggle) p.onSelectToggle(fp); else p.onEnter(fp, meta?.name || d) }}
          onContextMenu={e => p.onContextMenu(e, fp, meta?.name || d)}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--kq-row-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'var(--kq-row-even)' : 'var(--kq-row-odd)')}
        >
          {p.selectMode ? (
            <div className="w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ backgroundColor: p.selectedPaths?.has(fp) ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)', color: p.selectedPaths?.has(fp) ? '#fff' : 'transparent' }}>
              {p.selectedPaths?.has(fp) ? '✓' : ''}
            </div>
          ) : <span className="text-sm">📁</span>}
          <span className="flex-1 text-xs truncate" style={{ color: 'var(--kq-text-primary)' }}>
            {meta?.name || (p.cleanDisplay ? cleanDisplayName(d) : d)}
          </span>
        </div>
      )
    }
    const vp = joinPath(p.rootPath, item.name)
    return (
      <RootVideoRow
        fileName={item.name}
        filePath={vp}
        isWatched={rootWatchedVideos.includes(vp)}
        durationSec={p.data.videoDurations[vp]}
        onOpen={() => p.onVideoOpen(item.name)}
        onContextMenu={e => p.onVideoContextMenu(e, item.name)}
        even={i % 2 === 0}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, rootWatchedVideos])

  if (!hasFolders && !hasVideos) {
    return <div className="flex justify-center py-10 text-sm" style={{ color: 'var(--kq-empty-text)' }}>这里还没有番剧</div>
  }

  // ── 宫格模式：一个 VirtualGrid 打通文件夹 + 视频，分隔符占一整行 ──
  if (p.viewMode === 'grid') {
    return (
      <div className="relative w-full h-full" onWheel={scrollReveal.onWheel}>
        <VirtualGrid
          items={gridItems}
          itemKey={itemKey}
          cardWidth={cardSize}
          cardHeight={hasFolders ? folderCardHeight : videoCardHeight}
          secondaryCardHeight={hasFolders && hasVideos ? videoCardHeight : undefined}
          renderItem={renderItemGrid}
          scrollKey={`video-library:${p.rootPath}`}
          separatorAfter={hasFolders && hasVideos ? folderItems.length : undefined}
        />

        <ZoomSlider
          value={cardSize} min={110} max={240} step={10}
          onChange={handleCardSizeChange}
          visible={scrollReveal.visible}
          onMouseEnter={scrollReveal.onMouseEnter}
          onMouseLeave={scrollReveal.onMouseLeave}
        />
      </div>
    )
  }

  // 列表模式
  return (
    <div className="relative w-full h-full" onWheel={scrollReveal.onWheel}>
      <VirtualList
        items={listItems}
        itemKey={itemKey}
        rowHeight={44}
        renderItem={renderItemList}
        scrollKey={`video-library-list:${p.rootPath}`}
      />
    </div>
  )
}
