/**
 * 库主页 — 已核对旧版 main.py _show_root()
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { AnimeGrid } from '@/components/grid/AnimeGrid'
import { useLibraryStore } from '@/state/libraryStore'
import { useSettingsStore } from '@/state/settingsStore'
import { useNavigationStore } from '@/state/navigationStore'
import { useUiStore } from '@/state/uiStore'
import { useContextMenu } from '@/hooks/useContextMenu'
import { SORT_OPTIONS, DEFAULT_FILTER_KEYWORDS } from '@shared/types'
import type { SortKey } from '@shared/types'
import { List, Grid3X3 } from 'lucide-react'
import { np, joinPath } from '@/utils/path'

export function LibraryPage() {
  const data = useLibraryStore(s => s.data)
  const refresh = useLibraryStore(s => s.refresh)
  const scanFolder = useLibraryStore(s => s.scanFolder)
  const togglePin = useLibraryStore(s => s.togglePin)
  const toggleHide = useLibraryStore(s => s.toggleHide)
  const clearWatched = useLibraryStore(s => s.clearWatched)
  const setSort = useLibraryStore(s => s.setSort)
  const settings = useSettingsStore()
  const push = useNavigationStore(s => s.push)
  const filterQuery = useUiStore(s => s.filterQuery)
  const showConfirm = useUiStore(s => s.showConfirm)
  const { show } = useContextMenu()

  const [subdirs, setSubdirs] = useState<string[]>([])
  const [videos, setVideos] = useState<string[]>([])
  const [videoCounts, setVideoCounts] = useState<Record<string, number>>({})
  const [emptyFolders, setEmptyFolders] = useState<Set<string>>(new Set())
  const [rootDurations, setRootDurations] = useState<Record<string, number>>({})
  const [cleanDisplay, setCleanDisplay] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  // 文件夹和根目录视频现在合并进同一个虚拟列表了，list/grid 是统一的一个开关
  // （以前 rootVideoView 只管根目录视频那一小块，文件夹宫格没有这个概念）
  const [libraryViewMode, setLibraryViewMode] = useState<'list' | 'grid'>('grid')

  const root = np(data.root)

  // 扫描根目录 + 预取每个文件夹的视频数
  const doScan = useCallback(async () => {
    if (!root) return
    const result = await scanFolder(root)
    setSubdirs(result.subdirs)
    setVideos(result.videos)
    // 预取视频数 + 标记空文件夹
    const counts: Record<string, number> = {}
    const empties = new Set<string>()
    await Promise.all(result.subdirs.map(async (d) => {
      const fp = joinPath(root, d)
      try {
        const r = await (window.api as any).scanFolder(fp)
        if (r && r.videos.length === 0 && r.subdirs.length === 0) empties.add(fp)
      } catch { /* ignore，空文件夹判定失败不影响视频计数 */ }
      try {
        // 递归统计（含子文件夹），不能用浅层 scanFolder().videos.length —— 按季/按话
        // 分子文件夹存放的番剧会被浅层扫描算成 0 集，导致卡片进度条因为
        // totalVideos>0 这个条件不成立而不显示。
        counts[fp] = await window.api.countVideos(fp)
      } catch { counts[fp] = 0 }
    }))
    setVideoCounts(counts)
    setEmptyFolders(empties)
  }, [root, scanFolder])

  useEffect(() => { if (root) doScan() }, [root, doScan])

  // 后台扫描根目录视频时长
  useEffect(() => {
    for (const v of videos) {
      const vp = joinPath(root, v)
      if (rootDurations[vp] != null || data.videoDurations[vp] != null) continue
      window.api.getDuration(vp).then((r: any) => {
        if (r?.durationSec > 0) setRootDurations(prev => ({ ...prev, [vp]: r.durationSec }))
      }).catch(() => {})
    }
  }, [videos, root])

  const handleEnter = useCallback((folderPath: string, name: string) => {
    push({ path: np(folderPath), name })
  }, [push])

  // 排序 + 过滤
  const sortedDirs = useMemo(() => {
    let list = [...subdirs]
    // 合并内置 + 用户自定义过滤关键词（复刻旧版 is_anime_folder）
    const filterKws = new Set(DEFAULT_FILTER_KEYWORDS.map(k => k.toLowerCase()))
    if (settings.filterKeywords) {
      settings.filterKeywords.split(',').forEach(k => {
        const kw = k.trim().toLowerCase()
        if (kw) filterKws.add(kw)
      })
    }
    list = list.filter(d => {
      const fp = joinPath(root, d)
      if (!settings.showHidden && data.hidden.includes(fp)) return false
      // 自动过滤非番剧文件夹
      if (settings.autoFilter) {
        const name = d.toLowerCase().trim()
        if (filterKws.has(name)) return false
        // 空文件夹（无视频+无子文件夹）也过滤
        if (emptyFolders.has(fp)) return false
      }
      if (filterQuery) {
        const meta = data.folderMeta[fp]
        const dn = meta?.name || d
        if (!dn.toLowerCase().includes(filterQuery.toLowerCase())) return false
      }
      return true
    })
    const sortKey = data.sortKey || 'name'
    const desc = data.sortDesc
    list.sort((a, b) => {
      const fpa = joinPath(root, a); const fpb = joinPath(root, b)
      let cmp = 0
      if (sortKey === 'last_watched') cmp = (data.lastWatchedTime[fpa] || 0) - (data.lastWatchedTime[fpb] || 0)
      else if (sortKey === 'added_time') cmp = (data.addedTime[fpa] || 0) - (data.addedTime[fpb] || 0)
      else cmp = a.localeCompare(b, undefined, { numeric: true })
      return desc ? -cmp : cmp
    })
    const pinned = list.filter(d => data.pinned.includes(joinPath(root, d)))
    const unpinned = list.filter(d => !data.pinned.includes(joinPath(root, d)))
    return [...pinned, ...unpinned]
  }, [subdirs, data, filterQuery, settings.showHidden, settings.autoFilter, settings.filterKeywords, root, cleanDisplay, emptyFolders])

  // 根目录视频右键菜单
  const handleRootVideoCtx = useCallback(async (e: React.MouseEvent, vp: string) => {
    e.preventDefault()
    const isW = (data.watched[root] || []).includes(vp)
    const result = await show([
      { id: 'play', label: '▶ 打开' },
      { id: 'toggle', label: isW ? '✗ 标记未看' : '✓ 标记已看' },
      { id: 'sep', label: '', type: 'separator' },
      { id: 'open-folder', label: '📂 打开文件位置' },
      { id: 'delete', label: '❌ 删除文件' },
    ])
    if (result === 'play') window.api.launchPlayer(vp, root)
    if (result === 'open-folder') window.api.openFolder(vp)
    if (result === 'delete') { if (await window.api.deleteFile(vp)) doScan() }
    if (result === 'toggle') {
      const wl = data.watched[root] || []
      if (isW) {
        // 标记未看
        const newWl = wl.filter(p => p !== vp)
        await (window.api as any).setWatched?.(root, newWl)
        refresh()
      } else {
        await useLibraryStore.getState().markWatched(vp, root)
      }
    }
  }, [show, data, root, refresh, showConfirm, doScan])

  // 右键菜单（单卡）
  const handleContextMenu = useCallback(async (
    e: React.MouseEvent, folderPath: string, displayName: string,
  ) => {
    e.preventDefault()
    const fp = np(folderPath)
    const isPinned = data.pinned.includes(fp)
    const isHidden = data.hidden.includes(fp)

    if (selectMode) return // 多选模式不弹单卡菜单

    const result = await show([
      { id: 'pin', label: isPinned ? '📌 取消置顶' : '📌 置顶' },
      { id: 'open-folder', label: '📂 打开文件夹位置' },
      { id: 'sep1', label: '', type: 'separator' },
      { id: 'clear', label: '🗑 清除观看记录' },
      { id: 'hide', label: isHidden ? '👁 取消隐藏' : '👁 隐藏' },
      { id: 'delete', label: '❌ 删除文件夹（移入回收站）' },
      { id: 'sep2', label: '', type: 'separator' },
      { id: 'select', label: '☑ 多选' },
    ])
    switch (result) {
      case 'pin': await togglePin(fp); doScan(); break
      case 'hide': await toggleHide(fp); doScan(); break
      case 'clear':
        showConfirm({ title: '清除记录', message: `确定清除「${displayName}」的观看记录？`, onConfirm: () => clearWatched(fp) })
        break
      case 'open-folder': window.api.openFolder(fp); break
      case 'delete':
        if (await window.api.deleteFile(fp)) doScan()
        break
      case 'select':
        setSelectMode(true); setSelectedPaths(new Set())
        break
    }
  }, [selectMode, show, data, root, refresh, togglePin, toggleHide, clearWatched, showConfirm, doScan])

  // 统计
  const totalWatched = Object.values(data.watched).reduce((s, l) => s + l.length, 0)
  // 累计观看时长
  const totalSec = useMemo(() => {
    let sec = 0
    for (const [, vlist] of Object.entries(data.watched)) {
      for (const vp of vlist) {
        sec += data.videoDurations[vp] || 0
      }
    }
    return sec
  }, [data.watched, data.videoDurations])
  const fmtTotal = totalSec > 0
    ? `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`
    : ''
  const totalWatching = subdirs.filter(d => data.folderMeta[joinPath(root, d)]?.status === 'watching').length
  const totalDone = subdirs.filter(d => data.folderMeta[joinPath(root, d)]?.status === 'done').length

  // AnimeGrid 内部直接读 data.videoDurations[视频路径]，但根目录散装视频的时长
  // 是本地 rootDurations 这个临时状态存的（避免为了拿个时长就要刷新整个 store），
  // 传给 AnimeGrid 之前先合并一份，让它读同一个字段就能拿到两边的数据
  const mergedData = useMemo(() => ({
    ...data,
    videoDurations: { ...data.videoDurations, ...rootDurations },
  }), [data, rootDurations])

  if (!root) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl">🎬</div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--kq-text-primary)' }}>还没有设置动漫根目录</h2>
          <p className="text-sm" style={{ color: 'var(--kq-text-muted)' }}>点击上方「📁 根目录」选择存放动漫的总文件夹</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 统计/工具栏 */}
      <div className="flex items-center px-3 h-10 border-b shrink-0 text-xs gap-3"
        style={{ backgroundColor: 'var(--kq-bg-toolbar)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
        <span>📺 在看 {totalWatching}</span>
        <span>✅ 完结 {totalDone}</span>
        <span>▶ 已看 {totalWatched} 集</span>
        {fmtTotal && <span>⏱ {fmtTotal}</span>}
        <div className="flex-1" />
        <button onClick={() => setLibraryViewMode(v => v === 'list' ? 'grid' : 'list')}
          className="p-1.5 rounded" style={{ color: 'var(--kq-text-primary)' }}
          title={libraryViewMode === 'list' ? '切换到宫格' : '切换到列表'}>
          {libraryViewMode === 'list' ? <Grid3X3 size={16} /> : <List size={16} />}
        </button>
        <button onClick={() => { setCleanDisplay(!cleanDisplay) }}
          className="px-2 py-0.5 text-xs rounded text-white"
          style={{ backgroundColor: cleanDisplay ? 'var(--kq-btn-toggle-b)' : 'var(--kq-btn-toggle-a)' }}>
          {cleanDisplay ? '📝 短名' : '📝 原名'}
        </button>
        <select value={data.sortKey || 'name'} onChange={e => setSort(e.target.value as SortKey, data.sortDesc)}
          className="px-1.5 py-0.5 text-xs rounded border cursor-pointer"
          style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button onClick={() => setSort(data.sortKey || 'name', !data.sortDesc)}
          className="px-1.5 py-0.5 text-xs rounded border"
          style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
          {data.sortDesc ? '↓ 降序' : '↑ 升序'}
        </button>
        {selectMode && (
          <button onClick={() => { setSelectMode(false); setSelectedPaths(new Set()) }}
            className="px-2 py-0.5 text-xs rounded text-white font-bold"
            style={{ backgroundColor: 'var(--kq-accent)' }}>完成</button>
        )}
      </div>

      {/* 宫格 —— AnimeGrid 内部是虚拟滚动（react-window），文件夹 + 根目录
          散装视频合并进同一个连续列表，自己管理滚动和滚动位置记忆 */}
      <div className="flex-1 min-h-0 relative">
        <AnimeGrid
          rootPath={root}
          dirNames={sortedDirs}
          videoNames={videos}
          data={mergedData}
          videoCounts={videoCounts}
          cleanDisplay={cleanDisplay}
          viewMode={libraryViewMode}
          onEnter={handleEnter}
          onContextMenu={handleContextMenu}
          onVideoOpen={(v) => window.api.launchPlayer(joinPath(root, v), root)}
          onVideoContextMenu={(e, v) => handleRootVideoCtx(e, joinPath(root, v))}
          selectMode={selectMode}
          selectedPaths={selectedPaths}
          onSelectToggle={(fp) => setSelectedPaths(prev => {
            const next = new Set(prev)
            if (next.has(fp)) next.delete(fp); else next.add(fp)
            return next
          })}
        />
      </div>

      {/* 底栏 */}
      {filterQuery && (
        <div className="h-7 flex items-center px-3 text-xs border-t shrink-0"
          style={{ backgroundColor: 'var(--kq-bg-toolbar)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-dim)' }}>
          搜索「{filterQuery}」— {sortedDirs.length} 个结果
        </div>
      )}

      {/* 多选操作栏 */}
      {selectMode && selectedPaths.size > 0 && (
        <div className="h-11 flex items-center px-3 gap-2 border-t shrink-0"
          style={{ backgroundColor: 'var(--kq-bg-toolbar)', borderColor: 'var(--kq-border)' }}>
          <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>已选 {selectedPaths.size} 项</span>
          <button onClick={() => setSelectedPaths(new Set(sortedDirs.map(d => joinPath(root, d))))}
            className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>全选</button>
          <button onClick={() => setSelectedPaths(new Set())}
            className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>取消</button>
          <button onClick={async () => {
            await useLibraryStore.getState().toggleAllPin(Array.from(selectedPaths))
            setSelectMode(false); setSelectedPaths(new Set()); doScan()
          }} className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>📌 置顶</button>
          <button onClick={async () => {
            await useLibraryStore.getState().toggleAllHide(Array.from(selectedPaths))
            setSelectMode(false); setSelectedPaths(new Set()); doScan()
          }} className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>👁 隐藏</button>
          <button onClick={() => showConfirm({
            title: '批量清除', message: `确定清除 ${selectedPaths.size} 个番剧的观看记录？`,
            onConfirm: async () => { await useLibraryStore.getState().batchClear(Array.from(selectedPaths)); setSelectMode(false); setSelectedPaths(new Set()); doScan() }
          })} className="px-2 py-1 text-xs rounded text-white"
            style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>🗑 清记录</button>
        </div>
      )}
    </div>
  )
}
