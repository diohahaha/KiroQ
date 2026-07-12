/**
 * 图片库首页 — 镜像 src/pages/LibraryPage.tsx 的结构，数据全部走 useImageLibraryStore。
 * 文件夹列表来自 imageScanRoot() 的 subdirs（磁盘实际情况），folderMeta/tags/pinned/hidden
 * 只是叠加在上面的"附加信息"，新文件夹哪怕从没打开过也会出现在列表里。
 *
 * 空文件夹判定 / 类型筛选都用浅层 imageScanFolder（只读目录列表，不涉及解压），
 * 和封面生成（会解压 zip/cbz/epub）是两回事，不能混在一起，否则筛选本身也会变卡。
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useImageLibraryStore } from '@/state/imageLibraryStore'
import { useNavigationStore } from '@/state/navigationStore'
import { useUiStore } from '@/state/uiStore'
import { useContextMenu } from '@/hooks/useContextMenu'
import { ImageFolderCard } from '@/components/grid/ImageFolderCard'
import { ImageFolderRow } from '@/components/grid/ImageFolderRow'
import { VirtualGrid } from '@/components/grid/VirtualGrid'
import { VirtualList } from '@/components/grid/VirtualList'
import { FilterPopover } from '@/components/common/FilterPopover'
import { ZoomSlider } from '@/components/common/ZoomSlider'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { useSettingsStore } from '@/state/settingsStore'
import { joinPath } from '@/utils/path'
import { buildTagSubmenu, resolveTagToggle } from '@/utils/imageContextMenu'
import { IMAGE_SORT_OPTIONS } from '@shared/types'
import type { ImageSortKey, ImageResourceKind } from '@shared/types'
import { classifyImageResource } from '@shared/types'

export function ImageLibraryPage() {
  const {
    data, loaded, load, setRoot, togglePin, toggleHide, toggleFolderWatched, setFolderTags,
    batchTogglePin, batchToggleHide, batchDelete, saveFilter, setSort,
  } = useImageLibraryStore()
  const push = useNavigationStore(s => s.push)
  const searchQuery = useUiStore(s => s.filterQuery)
  const { show } = useContextMenu()

  const [subdirs, setSubdirs] = useState<string[]>([])
  const [scanned, setScanned] = useState(false)
  // 浅层扫描结果：每个子文件夹自己直属的文件/子目录（不递归，纯 readdir，很快）
  const [shallow, setShallow] = useState<Record<string, { subdirs: string[]; files: string[] }>>({})
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showOriginalName, setShowOriginalName] = useState(false)
  const [watchedFilter, setWatchedFilter] = useState<'all' | 'watched' | 'unwatched'>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cardSize, setCardSize] = useState(() => useSettingsStore.getState().imageLibraryCardSize)
  const saveSizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollReveal = useScrollReveal()

  // 之前这里有一份"封面加载进度"统计（跨全部卡片累加 done/total），换成虚拟
  // 滚动之后这个概念不成立了——虚拟滚动本来就是故意不一次性把全部封面都请求
  // 一遍，只有滚到视野里的卡片才会挂载发请求，"共 300 个还差 280 个没加载"
  // 这种进度条反而会让人误以为卡住了。滚动到哪、加载到哪，本身就是即时反馈，
  // 不需要额外的进度条。

  useEffect(() => { load() }, [])

  useEffect(() => {
    // 根目录没设置时，弹出选择文件夹（照抄视频库"根目录"按钮的选择器）
    if (loaded && !data.root) {
      window.api.pickFolder().then((picked) => { if (picked) setRoot(picked) })
    }
  }, [loaded, data.root])

  useEffect(() => {
    if (!data.root) return
    let cancelled = false
    setScanned(false)
    window.api.imageScanRoot(data.root).then(async (res) => {
      if (cancelled) return
      setSubdirs(res.subdirs)
      // 浅层扫描每个子文件夹，判空文件夹 + 判类型用。纯 readdir，不解压，不会卡。
      const entries: Record<string, { subdirs: string[]; files: string[] }> = {}
      await Promise.all(res.subdirs.map(async (d) => {
        const fp = joinPath(data.root, d)
        try {
          entries[fp] = await window.api.imageScanFolder(fp)
        } catch {
          entries[fp] = { subdirs: [], files: [] }
        }
      }))
      if (cancelled) return
      setShallow(entries)
      setScanned(true)
    })
    return () => { cancelled = true }
  }, [data.root])

  const folders = useMemo(() => {
    let list = subdirs.map(d => joinPath(data.root, d))
    list = list.filter(p => !data.hidden.includes(p))

    // 空文件夹自动隐藏
    if (data.autoFilterEmpty) {
      list = list.filter(p => {
        const s = shallow[p]
        if (!s) return true // 还没扫到就先显示，避免一开始误判成空
        return s.files.length > 0 || s.subdirs.length > 0
      })
    }

    // 自定义关键词过滤（精确匹配文件夹名）
    if (data.filterKeywords) {
      const kws = data.filterKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      if (kws.length > 0) {
        list = list.filter(p => {
          const name = p.split(/[\\/]/).pop()?.toLowerCase().trim() || ''
          return !kws.includes(name)
        })
      }
    }

    // 按资源类型筛选：文件夹里有文件时，至少一个文件类型被勾选才显示；只有子目录没有直属文件的先放行
    const { image, archive, ebook, video, other } = data.typeFilter
    if (!(image && archive && ebook && video && other)) {
      list = list.filter(p => {
        const s = shallow[p]
        if (!s || s.files.length === 0) return true
        return s.files.some(f => {
          const ext = f.slice(f.lastIndexOf('.'))
          const kind = classifyImageResource(ext) as ImageResourceKind
          if (kind === 'image') return image
          if (kind === 'archive') return archive
          if (kind === 'ebook') return ebook
          if (kind === 'video') return video
          return other
        })
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(p => (data.folderMeta[p]?.name || p).toLowerCase().includes(q))
    }

    if (watchedFilter !== 'all') {
      list = list.filter(p => {
        const w = data.folderWatched.includes(p)
        return watchedFilter === 'watched' ? w : !w
      })
    }

    if (tagFilter.length > 0) {
      list = list.filter(p => {
        const tags = data.folderMeta[p]?.tags || []
        return tagFilter.some(t => tags.includes(t))
      })
    }

    list.sort((a, b) => {
      const an = data.folderMeta[a]?.name || a
      const bn = data.folderMeta[b]?.name || b
      let cmp = data.sortKey === 'name'
        ? an.localeCompare(bn, undefined, { numeric: true })
        : (data.addedTime[a] || 0) - (data.addedTime[b] || 0)
      if (data.sortDesc) cmp = -cmp
      const ap = data.pinned.includes(a), bp = data.pinned.includes(b)
      if (ap !== bp) return ap ? -1 : 1
      return cmp
    })

    return list
  }, [subdirs, shallow, data, searchQuery, watchedFilter, tagFilter])

  const handleCardSizeChange = useCallback((v: number) => {
    setCardSize(v)
    if (saveSizeTimer.current) clearTimeout(saveSizeTimer.current)
    saveSizeTimer.current = setTimeout(() => {
      useSettingsStore.getState().save({ imageLibraryCardSize: v })
    }, 300)
  }, [])

  // "重新获取封面"强制刷新用：改变卡片 key 让 React 卸载重装，重新触发内部的封面拉取
  const [coverVersion, setCoverVersion] = useState<Record<string, number>>({})
  const bumpCoverVersion = useCallback((p: string) => {
    setCoverVersion(v => ({ ...v, [p]: (v[p] || 0) + 1 }))
  }, [])

  async function handleFolderContextMenu(e: React.MouseEvent, folderPath: string) {
    e.preventDefault()
    const isPinned = data.pinned.includes(folderPath)
    const isHidden = data.hidden.includes(folderPath)
    const isWatched = data.folderWatched.includes(folderPath)
    const currentTags = data.folderMeta[folderPath]?.tags || []

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

    if (result === 'open-folder') window.api.openFolder(folderPath)
    else if (result === 'pin') togglePin(folderPath)
    else if (result === 'hide') toggleHide(folderPath)
    else if (result === 'watched') toggleFolderWatched(folderPath)
    else if (result === 'refresh-cover') { await window.api.imageRegenerateFolderCover(folderPath); bumpCoverVersion(folderPath) }
    else if (result === 'delete') {
      const deleted = await batchDelete([folderPath])
      if (deleted.length > 0) setSubdirs(s => s.filter(d => joinPath(data.root, d) !== folderPath))
    } else {
      const next = resolveTagToggle(result, currentTags)
      if (next) setFolderTags(folderPath, next)
    }
  }

  function enterFolder(folderPath: string) {
    const name = data.folderMeta[folderPath]?.name || folderPath.split(/[\\/]/).pop() || folderPath
    push({ path: folderPath, name })
  }

  function toggleSelect(p: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return
    const deleted = await batchDelete(Array.from(selected))
    if (deleted.length > 0) setSubdirs(s => s.filter(d => !deleted.includes(joinPath(data.root, d))))
    setSelected(new Set())
    setSelectMode(false)
  }

  const toggleType = useCallback((kind: 'image' | 'archive' | 'ebook' | 'video' | 'other') => {
    saveFilter({ typeFilter: { ...data.typeFilter, [kind]: !data.typeFilter[kind] } })
  }, [data.typeFilter, saveFilter])

  // 判断当前是否有筛选条件偏离默认状态，用来在"筛选"按钮上显示提示圆点
  const filterActive = watchedFilter !== 'all' || tagFilter.length > 0 ||
    Object.values(data.typeFilter).some(v => !v) || !data.autoFilterEmpty

  if (!data.root) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--kq-empty-text)' }}>
        请选择图片库根目录…
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--kq-border)' }}>
        <button
          className="px-2 py-1 text-xs rounded"
          style={{ backgroundColor: selectMode ? 'var(--kq-accent)' : 'var(--kq-bg-card)', color: selectMode ? '#fff' : 'var(--kq-text-primary)' }}
          onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }}
        >☑ 多选</button>

        {/* 列表/宫格切换 */}
        <div className="flex items-center rounded-md overflow-hidden border" style={{ borderColor: 'var(--kq-border)' }}>
          <button onClick={() => setViewMode('list')}
            className="px-2 py-1 text-xs"
            style={{ backgroundColor: viewMode === 'list' ? 'var(--kq-accent)' : 'var(--kq-bg-card)', color: viewMode === 'list' ? '#fff' : 'var(--kq-text-primary)' }}
          >☰ 列表</button>
          <button onClick={() => setViewMode('grid')}
            className="px-2 py-1 text-xs"
            style={{ backgroundColor: viewMode === 'grid' ? 'var(--kq-accent)' : 'var(--kq-bg-card)', color: viewMode === 'grid' ? '#fff' : 'var(--kq-text-primary)' }}
          >▦ 宫格</button>
        </div>

        <button className="px-2 py-1 text-xs rounded" style={{ backgroundColor: 'var(--kq-bg-card)', color: 'var(--kq-text-primary)' }}
          onClick={() => setShowOriginalName(v => !v)}>
          📝 {showOriginalName ? '原名' : '短名'}
        </button>

        {/* 排序 */}
        <select value={data.sortKey} onChange={e => setSort(e.target.value as ImageSortKey, data.sortDesc)}
          className="px-1.5 py-1 text-xs rounded border cursor-pointer"
          style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
          {IMAGE_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button onClick={() => setSort(data.sortKey, !data.sortDesc)}
          className="px-1.5 py-1 text-xs rounded border"
          style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
          {data.sortDesc ? '↓ 降序' : '↑ 升序'}
        </button>

        {/* 筛选：类型/已看/标签/空文件夹自动隐藏，收进一个下拉面板里 */}
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
                    borderColor: data.typeFilter[kind] ? 'var(--kq-accent)' : 'var(--kq-border)',
                    backgroundColor: data.typeFilter[kind] ? 'var(--kq-accent)' : 'transparent',
                    color: data.typeFilter[kind] ? '#fff' : 'var(--kq-text-dim)',
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

          <label className="flex items-center justify-between cursor-pointer pt-1 border-t" style={{ borderColor: 'var(--kq-border)' }}>
            <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>🗂 空文件夹自动隐藏</span>
            <input type="checkbox" checked={data.autoFilterEmpty}
              onChange={() => saveFilter({ autoFilterEmpty: !data.autoFilterEmpty })}
              className="w-4 h-4 rounded" />
          </label>
        </FilterPopover>

        {selectMode && selected.size > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>已选 {selected.size}</span>
            <button className="px-2 py-1 text-xs rounded" style={{ backgroundColor: 'var(--kq-btn)', color: '#fff' }}
              onClick={() => batchTogglePin(Array.from(selected))}>置顶</button>
            <button className="px-2 py-1 text-xs rounded" style={{ backgroundColor: 'var(--kq-btn)', color: '#fff' }}
              onClick={() => batchToggleHide(Array.from(selected))}>隐藏</button>
            <button className="px-2 py-1 text-xs rounded" style={{ backgroundColor: '#aa3a3a', color: '#fff' }}
              onClick={handleBatchDelete}>删除</button>
          </div>
        )}
      </div>

      {/* 列表/宫格内容 —— 换成虚拟滚动，不在可视区域的卡片不挂载，
          文件夹多的时候不会一开始就同时发起几百个封面请求 */}
      <div className="relative flex-1 overflow-hidden" onWheel={scrollReveal.onWheel}>
        {!scanned ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--kq-empty-text)' }}>扫描中…</div>
        ) : folders.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--kq-empty-text)' }}>
            没有找到图片文件夹
          </div>
        ) : viewMode === 'grid' ? (
          <VirtualGrid
            items={folders}
            itemKey={p => p}
            cardWidth={cardSize}
            cardHeight={Math.round((cardSize - 6) * (200 / 154)) + 56}
            scrollKey={`image-library:${data.root}`}
            renderItem={p => (
              <ImageFolderCard
                key={`${p}:v${coverVersion[p] || 0}`}
                folderPath={p}
                meta={data.folderMeta[p] || null}
                isPinned={data.pinned.includes(p)}
                isHidden={data.hidden.includes(p)}
                isWatched={data.folderWatched.includes(p)}
                tagDefs={data.tagDefs}
                showOriginalName={showOriginalName}
                onEnter={() => enterFolder(p)}
                onContextMenu={(e) => handleFolderContextMenu(e, p)}
                selectMode={selectMode}
                isSelected={selected.has(p)}
                onSelectToggle={() => toggleSelect(p)}
                size={cardSize}
                enableAnimation={false}
              />
            )}
          />
        ) : (
          <VirtualList
            items={folders}
            itemKey={p => p}
            rowHeight={44}
            scrollKey={`image-library-list:${data.root}`}
            renderItem={(p, i) => (
              <ImageFolderRow
                key={`${p}:v${coverVersion[p] || 0}`}
                folderPath={p}
                meta={data.folderMeta[p] || null}
                isPinned={data.pinned.includes(p)}
                isWatched={data.folderWatched.includes(p)}
                tagDefs={data.tagDefs}
                showOriginalName={showOriginalName}
                onEnter={() => enterFolder(p)}
                onContextMenu={(e) => handleFolderContextMenu(e, p)}
                selectMode={selectMode}
                isSelected={selected.has(p)}
                onSelectToggle={() => toggleSelect(p)}
                even={i % 2 === 0}
              />
            )}
          />
        )}

        {viewMode === 'grid' && (
          <ZoomSlider
            value={cardSize} min={110} max={240} step={10}
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
