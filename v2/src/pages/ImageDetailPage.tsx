/**
 * 图片文件夹详情页 — 镜像 src/pages/DetailPage.tsx。
 * 进入一个图片文件夹后：先列子文件夹（如果有，宫格同 ImageFolderCard），
 * 再列该文件夹直属的文件（图片/压缩包/epub/txt），list/grid 切换，双击调用系统或指定程序打开。
 *
 * 本版加上：搜索(复用顶部搜索框) / 已看筛选 / 标签筛选 / 类型筛选 + 封面加载进度提示。
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { classifyImageResource } from '@shared/types'
import type { ImageResourceKind } from '@shared/types'
import { useImageLibraryStore } from '@/state/imageLibraryStore'
import { useNavigationStore } from '@/state/navigationStore'
import { useUiStore } from '@/state/uiStore'
import { useContextMenu } from '@/hooks/useContextMenu'
import { joinPath } from '@/utils/path'
import { buildTagSubmenu, resolveTagToggle } from '@/utils/imageContextMenu'
import { ImageFolderCard } from '@/components/grid/ImageFolderCard'
import { ImageFolderRow } from '@/components/grid/ImageFolderRow'
import { ImageFileCard } from '@/components/grid/ImageFileCard'
import { ImageFileRow } from '@/components/grid/ImageFileRow'
import { VirtualGrid } from '@/components/grid/VirtualGrid'
import { VirtualList } from '@/components/grid/VirtualList'
import { FilterPopover } from '@/components/common/FilterPopover'
import { ZoomSlider } from '@/components/common/ZoomSlider'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { useSettingsStore } from '@/state/settingsStore'

interface ImageDetailPageProps {
  folderPath: string
}

export function ImageDetailPage({ folderPath }: ImageDetailPageProps) {
  const {
    data, scanFolder, updateMeta, toggleFileWatched, openFile, batchDelete,
    togglePin, toggleHide, toggleFolderWatched, setFolderTags, setFileTags,
  } = useImageLibraryStore()
  const push = useNavigationStore(s => s.push)
  const searchQuery = useUiStore(s => s.filterQuery)
  const { show } = useContextMenu()

  const [subdirs, setSubdirs] = useState<string[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [watchedFilter, setWatchedFilter] = useState<'all' | 'watched' | 'unwatched'>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState({ image: true, archive: true, ebook: true, video: true, other: true })

  const [cardSize, setCardSize] = useState(() => useSettingsStore.getState().imageDetailCardSize)
  const saveSizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollReveal = useScrollReveal()

  // 强制某个文件/文件夹卡片重新挂载、重新拉一次封面（"重新获取封面"用）：
  // 卡片内部封面状态是组件自己 useState 管理的，父组件拿不到，最简单的办法
  // 就是改变它的 key，让 React 直接把这张卡片卸载重装一遍。
  const [coverVersion, setCoverVersion] = useState<Record<string, number>>({})
  const bumpCoverVersion = useCallback((p: string) => {
    setCoverVersion(v => ({ ...v, [p]: (v[p] || 0) + 1 }))
  }, [])

  // "⚡ 获取超大文件封面"：找出这个文件夹里因为超过体积上限被自动跳过的文件，逐个强制重试
  const [oversizedBusy, setOversizedBusy] = useState(false)
  const [oversizedProgress, setOversizedProgress] = useState<{ done: number; total: number } | null>(null)
  const oversizedCancelRef = useRef(false)

  async function handleFetchOversized() {
    oversizedCancelRef.current = false
    setOversizedBusy(true)
    try {
      const names = await window.api.imageGetOversizedFiles(folderPath)
      if (names.length === 0) {
        setOversizedProgress(null)
        return
      }
      setOversizedProgress({ done: 0, total: names.length })
      for (let i = 0; i < names.length; i++) {
        // 只能"处理完当前这一个就不再开始下一个"，没法中断已经在跑的那次
        // adm-zip/pdftoppm 调用——这个是同步/子进程调用，中途打断不安全。
        if (oversizedCancelRef.current) break
        const fp = joinPath(folderPath, names[i])
        await window.api.imageRegenerateCover(fp)
        bumpCoverVersion(fp)
        setOversizedProgress({ done: i + 1, total: names.length })
      }
    } finally {
      setOversizedBusy(false)
      setTimeout(() => setOversizedProgress(null), 2000)
    }
  }

  function handleCancelOversized() {
    oversizedCancelRef.current = true
  }

  const meta = data.folderMeta[folderPath]
  const viewMode = meta?.fileViewMode || 'list'

  useEffect(() => {
    let cancelled = false
    scanFolder(folderPath).then(res => {
      if (cancelled) return
      setSubdirs(res.subdirs)
      setFiles(res.files)
    })
    return () => { cancelled = true }
  }, [folderPath, scanFolder])

  const watchedSet = useMemo(() => new Set(data.fileWatched[folderPath] || []), [data.fileWatched, folderPath])

  // 筛选后的文件列表
  const visibleFiles = useMemo(() => {
    let list = files
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(f => f.toLowerCase().includes(q))
    }
    if (watchedFilter !== 'all') {
      list = list.filter(f => {
        const w = watchedSet.has(joinPath(folderPath, f))
        return watchedFilter === 'watched' ? w : !w
      })
    }
    if (tagFilter.length > 0) {
      list = list.filter(f => {
        const tags = data.fileTags[joinPath(folderPath, f)] || []
        return tagFilter.some(t => tags.includes(t))
      })
    }
    const { image, archive, ebook, video, other } = typeFilter
    if (!(image && archive && ebook && video && other)) {
      list = list.filter(f => {
        const ext = f.slice(f.lastIndexOf('.'))
        const kind = classifyImageResource(ext) as ImageResourceKind
        if (kind === 'image') return image
        if (kind === 'archive') return archive
        if (kind === 'ebook') return ebook
        if (kind === 'video') return video
        return other
      })
    }
    return list
  }, [files, searchQuery, watchedFilter, tagFilter, typeFilter, watchedSet, folderPath, data.fileTags])

  const handleCardSizeChange = useCallback((v: number) => {
    setCardSize(v)
    if (saveSizeTimer.current) clearTimeout(saveSizeTimer.current)
    saveSizeTimer.current = setTimeout(() => {
      useSettingsStore.getState().save({ imageDetailCardSize: v })
    }, 300)
  }, [])

  function toggleSelect(p: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }

  function setViewMode(mode: 'list' | 'grid') {
    updateMeta(folderPath, { fileViewMode: mode })
  }

  async function refresh() {
    const res = await scanFolder(folderPath)
    setSubdirs(res.subdirs)
    setFiles(res.files)
  }

  async function handleSubfolderContextMenu(e: React.MouseEvent, subPath: string) {
    e.preventDefault()
    const isPinned = data.pinned.includes(subPath)
    const isHidden = data.hidden.includes(subPath)
    const isWatched = data.folderWatched.includes(subPath)
    const currentTags = data.folderMeta[subPath]?.tags || []

    const result = await show([
      { id: 'open-folder', label: '📂 打开文件位置' },
      { id: 'sep1', label: '', type: 'separator' },
      { id: 'pin', label: isPinned ? '📌 取消置顶' : '📌 置顶' },
      { id: 'hide', label: isHidden ? '👁 取消隐藏' : '👁 隐藏' },
      { id: 'watched', label: isWatched ? '✗ 标记未看' : '✓ 标记已看' },
      { id: 'sep2', label: '', type: 'separator' },
      buildTagSubmenu(data.tagDefs, currentTags),
      { id: 'refresh-cover', label: '🔄 重新获取封面' },
      { id: 'sep3', label: '', type: 'separator' },
      { id: 'delete', label: '❌ 删除' },
    ])
    if (!result) return

    if (result === 'open-folder') window.api.openFolder(subPath)
    else if (result === 'pin') togglePin(subPath)
    else if (result === 'hide') toggleHide(subPath)
    else if (result === 'watched') toggleFolderWatched(subPath)
    else if (result === 'refresh-cover') { await window.api.imageRegenerateFolderCover(subPath); bumpCoverVersion(subPath) }
    else if (result === 'delete') { await batchDelete([subPath]); refresh() }
    else {
      const next = resolveTagToggle(result, currentTags)
      if (next) setFolderTags(subPath, next)
    }
  }

  async function handleFileContextMenu(e: React.MouseEvent, filePath: string) {
    e.preventDefault()
    const isWatched = watchedSet.has(filePath)
    const currentTags = data.fileTags[filePath] || []

    const result = await show([
      { id: 'open', label: '▶ 打开' },
      { id: 'open-folder', label: '📂 打开文件位置' },
      { id: 'sep1', label: '', type: 'separator' },
      { id: 'watched', label: isWatched ? '✗ 标记未看' : '✓ 标记已看' },
      { id: 'sep2', label: '', type: 'separator' },
      buildTagSubmenu(data.tagDefs, currentTags),
      { id: 'refresh-cover', label: '🔄 重新获取封面' },
      { id: 'sep3', label: '', type: 'separator' },
      { id: 'delete', label: '❌ 删除' },
    ])
    if (!result) return

    if (result === 'open') openFile(filePath)
    else if (result === 'open-folder') window.api.openFolder(filePath)
    else if (result === 'watched') toggleFileWatched(filePath, folderPath)
    else if (result === 'refresh-cover') { await window.api.imageRegenerateCover(filePath); bumpCoverVersion(filePath) }
    else if (result === 'delete') { await batchDelete([filePath]); refresh() }
    else {
      const next = resolveTagToggle(result, currentTags)
      if (next) setFileTags(filePath, next)
    }
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return
    await batchDelete(Array.from(selected))
    setSelected(new Set())
    setSelectMode(false)
    await refresh()
  }

  const toggleType = (kind: 'image' | 'archive' | 'ebook' | 'video' | 'other') =>
    setTypeFilter(f => ({ ...f, [kind]: !f[kind] }))

  const filterActive = watchedFilter !== 'all' || tagFilter.length > 0 || Object.values(typeFilter).some(v => !v)

  // 子文件夹 + 文件合并成一个连续列表 —— 之前分成两块各自滚动，体验上是
  // "上面一小块自己滚、下面一块自己滚"，互不影响，用户反馈很奇怪，现在
  // 合并回一个连续虚拟列表，文件夹排前面、文件排后面，共用一根滚动条。
  type DetailGridItem = { kind: 'folder'; name: string } | { kind: 'file'; name: string }
  const combinedItems: DetailGridItem[] = useMemo(() => [
    ...subdirs.map(name => ({ kind: 'folder' as const, name })),
    ...visibleFiles.map(name => ({ kind: 'file' as const, name })),
  ], [subdirs, visibleFiles])

  const combinedItemKey = useCallback((item: DetailGridItem) =>
    item.kind === 'folder' ? `f:${joinPath(folderPath, item.name)}` : `file:${joinPath(folderPath, item.name)}`,
    [folderPath])

  // react-window 要求同一个虚拟网格里所有行高度一致，文件夹卡片和文件卡片
  // 尺寸公式不一样（封面比例、底部文字区域都不同），取两者中较高的一个当
  // 共用行高，矮一点的那种卡片会在格子里留一点空白，不影响观感。
  const folderCardHeight = Math.round((cardSize - 6) * (200 / 154)) + 56
  const fileCardHeight = Math.round((cardSize - 6) * (170 / 134)) + 46
  const combinedCardHeight = Math.max(folderCardHeight, fileCardHeight)

  const renderCombinedGrid = useCallback((item: DetailGridItem) => {
    if (item.kind === 'folder') {
      const sub = joinPath(folderPath, item.name)
      return (
        <ImageFolderCard
          key={`${sub}:v${coverVersion[sub] || 0}`}
          folderPath={sub}
          meta={data.folderMeta[sub] || null}
          isPinned={data.pinned.includes(sub)}
          isHidden={data.hidden.includes(sub)}
          isWatched={data.folderWatched.includes(sub)}
          tagDefs={data.tagDefs}
          showOriginalName={false}
          onEnter={() => push?.({ path: sub, name: data.folderMeta[sub]?.name || item.name })}
          onContextMenu={(e) => handleSubfolderContextMenu(e, sub)}
          size={cardSize}
          selectMode={selectMode}
          isSelected={selected.has(sub)}
          onSelectToggle={() => toggleSelect(sub)}
          enableAnimation={false}
        />
      )
    }
    const f = item.name
    const filePath = joinPath(folderPath, f)
    const ext = f.slice(f.lastIndexOf('.'))
    const kind = classifyImageResource(ext)!
    return (
      <ImageFileCard
        key={`${filePath}:v${coverVersion[filePath] || 0}`}
        filePath={filePath}
        fileName={f}
        kind={kind}
        isWatched={watchedSet.has(filePath)}
        tagIds={data.fileTags[filePath] || []}
        tagDefs={data.tagDefs}
        onOpen={() => openFile(filePath)}
        onContextMenu={(e) => handleFileContextMenu(e, filePath)}
        selectMode={selectMode}
        isSelected={selected.has(filePath)}
        onSelectToggle={() => toggleSelect(filePath)}
        size={cardSize}
        enableAnimation={false}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath, data, selectMode, selected, cardSize, coverVersion, watchedSet, push])

  const renderCombinedList = useCallback((item: DetailGridItem, i: number) => {
    if (item.kind === 'folder') {
      const sub = joinPath(folderPath, item.name)
      return (
        <ImageFolderRow
          key={`${sub}:v${coverVersion[sub] || 0}`}
          folderPath={sub}
          meta={data.folderMeta[sub] || null}
          isPinned={data.pinned.includes(sub)}
          isWatched={data.folderWatched.includes(sub)}
          tagDefs={data.tagDefs}
          showOriginalName={false}
          onEnter={() => push?.({ path: sub, name: data.folderMeta[sub]?.name || item.name })}
          onContextMenu={(e) => handleSubfolderContextMenu(e, sub)}
          even={i % 2 === 0}
          selectMode={selectMode}
          isSelected={selected.has(sub)}
          onSelectToggle={() => toggleSelect(sub)}
        />
      )
    }
    const f = item.name
    const filePath = joinPath(folderPath, f)
    const ext = f.slice(f.lastIndexOf('.'))
    const kind = classifyImageResource(ext)!
    return (
      <ImageFileRow
        key={`${filePath}:v${coverVersion[filePath] || 0}`}
        filePath={filePath}
        fileName={f}
        kind={kind}
        isWatched={watchedSet.has(filePath)}
        tagIds={data.fileTags[filePath] || []}
        tagDefs={data.tagDefs}
        lastOpened={data.lastOpened[filePath]}
        onOpen={() => openFile(filePath)}
        onContextMenu={(e) => handleFileContextMenu(e, filePath)}
        selectMode={selectMode}
        isSelected={selected.has(filePath)}
        onSelectToggle={() => toggleSelect(filePath)}
        even={i % 2 === 0}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath, data, selectMode, selected, coverVersion, watchedSet, push])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--kq-border)' }}>
        <button
          className="px-2 py-1 text-xs rounded"
          style={{ backgroundColor: viewMode === 'list' ? 'var(--kq-accent)' : 'var(--kq-bg-card)', color: viewMode === 'list' ? '#fff' : 'var(--kq-text-primary)' }}
          onClick={() => setViewMode('list')}
        >☰ 列表</button>
        <button
          className="px-2 py-1 text-xs rounded"
          style={{ backgroundColor: viewMode === 'grid' ? 'var(--kq-accent)' : 'var(--kq-bg-card)', color: viewMode === 'grid' ? '#fff' : 'var(--kq-text-primary)' }}
          onClick={() => setViewMode('grid')}
        >▦ 宫格</button>

        <button
          className="px-2 py-1 text-xs rounded ml-2"
          style={{ backgroundColor: selectMode ? 'var(--kq-accent)' : 'var(--kq-bg-card)', color: selectMode ? '#fff' : 'var(--kq-text-primary)' }}
          onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }}
        >☑ 多选</button>

        <button
          className="px-2 py-1 text-xs rounded border disabled:opacity-50"
          style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}
          disabled={oversizedBusy}
          onClick={handleFetchOversized}
          title="找出这个文件夹里因为体积超过默认上限被跳过的压缩包/电子书，强制重新获取封面"
        >⚡ {oversizedBusy ? '获取中…' : '获取超大文件封面'}</button>

        {/* 筛选：类型/已看/标签，收进一个下拉面板里 */}
        <FilterPopover active={filterActive}>
          <div>
            <div className="text-[11px] mb-1.5" style={{ color: 'var(--kq-text-dim)' }}>资源类型</div>
            <div className="flex flex-wrap gap-1">
              {(['image', 'archive', 'ebook', 'video', 'other'] as const).map(kind => (
                <button
                  key={kind}
                  onClick={() => toggleType(kind)}
                  className="px-1.5 py-0.5 text-[10px] rounded border"
                  style={{
                    borderColor: typeFilter[kind] ? 'var(--kq-accent)' : 'var(--kq-border)',
                    backgroundColor: typeFilter[kind] ? 'var(--kq-accent)' : 'transparent',
                    color: typeFilter[kind] ? '#fff' : 'var(--kq-text-dim)',
                  }}
                >
                  {kind === 'image' ? '🖼️ 图片' : kind === 'archive' ? '📦 压缩包' : kind === 'ebook' ? '📖 电子书'
                    : kind === 'video' ? '🎬 视频' : '📄 其他'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] mb-1.5" style={{ color: 'var(--kq-text-dim)' }}>观看状态</div>
            <select
              className="w-full px-2 py-1 text-xs rounded bg-transparent border"
              style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}
              value={watchedFilter}
              onChange={e => setWatchedFilter(e.target.value as any)}
            >
              <option value="all">全部</option>
              <option value="watched">已看</option>
              <option value="unwatched">未看</option>
            </select>
          </div>

          <div>
            <div className="text-[11px] mb-1.5" style={{ color: 'var(--kq-text-dim)' }}>标签</div>
            <div className="flex flex-wrap gap-1">
              {data.tagDefs.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setTagFilter(f => f.includes(tag.id) ? f.filter(t => t !== tag.id) : [...f, tag.id])}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border"
                  style={{
                    borderColor: tagFilter.includes(tag.id) ? tag.color : 'var(--kq-border)',
                    backgroundColor: tagFilter.includes(tag.id) ? tag.color : 'transparent',
                    color: tagFilter.includes(tag.id) ? '#fff' : 'var(--kq-text-dim)',
                  }}
                >
                  {tag.type === 'color' && (
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: tagFilter.includes(tag.id) ? '#fff' : tag.color }} />
                  )}
                  {tag.label}
                </button>
              ))}
              {data.tagDefs.length === 0 && <span className="text-[10px]" style={{ color: 'var(--kq-text-dim)' }}>还没有标签</span>}
            </div>
          </div>
        </FilterPopover>

        {selectMode && selected.size > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>已选 {selected.size}</span>
            <button className="px-2 py-1 text-xs rounded" style={{ backgroundColor: '#aa3a3a', color: '#fff' }}
              onClick={handleBatchDelete}>删除</button>
          </div>
        )}
      </div>

      {oversizedProgress && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs shrink-0 border-b"
          style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-dim)' }}>
          <span>⚡ 正在获取超大文件封面 {oversizedProgress.done}/{oversizedProgress.total}</span>
          <div className="flex-1" />
          {oversizedBusy && (
            <button
              onClick={handleCancelOversized}
              className="px-2 py-0.5 text-[11px] rounded border hover:opacity-80"
              style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}
            >✕ 取消</button>
          )}
        </div>
      )}

      {/* 子文件夹 + 文件合并成一个连续虚拟列表，文件夹排前面、文件排后面，
          共用一根滚动条（之前是两块独立滚动区域，体验割裂，现在改回连续） */}
      <div className="relative flex-1 overflow-hidden" onWheel={scrollReveal.onWheel}>
        {combinedItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--kq-empty-text)' }}>
            {subdirs.length === 0 && files.length === 0 ? '这个文件夹是空的' : '没有符合筛选条件的文件'}
          </div>
        ) : viewMode === 'grid' ? (
          <VirtualGrid
            items={combinedItems}
            itemKey={combinedItemKey}
            cardWidth={cardSize}
            cardHeight={combinedCardHeight}
            scrollKey={`image-detail:${folderPath}`}
            renderItem={renderCombinedGrid}
          />
        ) : (
          <VirtualList
            items={combinedItems}
            itemKey={combinedItemKey}
            rowHeight={44}
            scrollKey={`image-detail-list:${folderPath}`}
            renderItem={renderCombinedList}
          />
        )}

        {viewMode === 'grid' && (
          <ZoomSlider
            value={cardSize} min={100} max={220} step={10}
            onChange={handleCardSizeChange}
            visible={scrollReveal.visible}
            onMouseEnter={scrollReveal.onMouseEnter}
            onMouseLeave={scrollReveal.onMouseLeave}
          />
        )}
      </div>
    </div>
  )
}
