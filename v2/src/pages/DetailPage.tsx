/**
 * 详情页 — 已核对旧版 ui/detail.py + ui/video_list.py
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { List, Grid3X3, Play, ExternalLink } from 'lucide-react'
import { AnimeCard } from '@/components/grid/AnimeCard'
import { useLibraryStore } from '@/state/libraryStore'
import { useNavigationStore } from '@/state/navigationStore'
import { useUiStore } from '@/state/uiStore'
import { useSettingsStore } from '@/state/settingsStore'
import { useContextMenu } from '@/hooks/useContextMenu'
import { np, joinPath } from '@/utils/path'
import { cleanSearchKeyword, cleanDisplayName } from '@/utils/cleanName'

interface Props { folderPath: string }

/** 秒 → MM:SS 或 H:MM:SS */
function fmtDur(sec: number): string {
  const s = Math.floor(sec); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function DetailPage({ folderPath }: Props) {
  const fp = np(folderPath)
  const data = useLibraryStore(s => s.data)
  const refresh = useLibraryStore(s => s.refresh)
  const updateMeta = useLibraryStore(s => s.updateMeta)
  const markWatched = useLibraryStore(s => s.markWatched)
  const clearWatched = useLibraryStore(s => s.clearWatched)
  const push = useNavigationStore(s => s.push)
  const openModal = useUiStore(s => s.openModal)
  const setEditFolderPath = useUiStore(s => s.setEditFolderPath)
  const { show } = useContextMenu()

  const meta = data.folderMeta[fp]
  const dn = meta?.name || fp.split('\\').pop() || fp
  const watchedList: string[] = data.watched[fp] || []

  const [subdirs, setSubdirs] = useState<string[]>([])
  const [videos, setVideos] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'list'|'grid'>(meta?.videoViewMode || 'list')
  const [sortDesc, setSortDesc] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [thumbHashes, setThumbHashes] = useState<Record<string, string>>({})
  // 缩略图第一次加载失败时的重试计数 / 最终放弃标记——ffmpeg 后台截帧是异步的，
  // 第一次请求时文件经常还没生成完（404），隔一小段时间自动重试几次就能刷出来，
  // 不用再重新进文件夹
  const [thumbRetry, setThumbRetry] = useState<Record<string, number>>({})
  const [thumbFailed, setThumbFailed] = useState<Record<string, boolean>>({})
  const handleThumbError = useCallback((key: string) => {
    setThumbRetry(prev => {
      const n = prev[key] || 0
      if (n >= 6) { setThumbFailed(f => ({ ...f, [key]: true })); return prev }
      setTimeout(() => setThumbRetry(p => ({ ...p, [key]: (p[key] || 0) + 1 })), 800)
      return prev
    })
  }, [])

  const doScan = useCallback(async () => {
    const r = await window.api.scanFolder(fp)
    if (r) { setSubdirs(r.subdirs || []); setVideos(r.videos || []) }
  }, [fp])

  useEffect(() => { doScan() }, [doScan])

  // fp 变化（切换文件夹）时同步重置临时 UI 状态——注意这里不用 useEffect。
  // useEffect 要等这一帧画到屏幕上之后才会执行，用户会先看见一帧"标题已经
  // 换成新文件夹、列表还是旧文件夹内容"的画面，肉眼就是切换时闪一下。
  // 改成 render 阶段直接比较 fp 和上次渲染的 fp，不一致就立刻同步清空
  // （这是 React 官方推荐的"根据 prop 变化调整 state"写法），保证清空后
  // 的这一帧才会被画出来，不会露出旧内容。
  const [prevFp, setPrevFp] = useState(fp)
  if (fp !== prevFp) {
    setPrevFp(fp)
    setSelectMode(false)
    setSel(new Set())
    setViewMode(meta?.videoViewMode || 'list')
    setSubdirs([])
    setVideos([])
  }

  // 自动抓取（进入未抓取的文件夹时）
  const settings = useSettingsStore()
  const [autoFetching, setAutoFetching] = useState(false)
  useEffect(() => {
    if (!settings.autoFetch || !meta || meta.fetched) return
    const kw = cleanSearchKeyword(meta.name || fp.split('\\').pop() || '')
    if (!kw) return
    let cancelled = false
    setAutoFetching(true)
    const run = async () => {
      try {
        const results = await window.api.bangumiSearch(kw)
        if (cancelled) return
        if (results && results.length > 0) {
          const item = results[0]
          const cover = await window.api.bangumiDownloadCover(item.image, fp)
          if (cancelled) return
          updateMeta(fp, {
            name: item.name_cn || item.name,
            desc: item.summary || '',
            link: `https://bgm.tv/subject/${item.id}`,
            rating: item.rating || null,
            cover: cover || undefined,
            bgmId: item.id,
            fetched: true,
            source: 'bangumi',
          } as any)
        } else {
          updateMeta(fp, { fetched: true } as any)
        }
      } catch { /* skip */ }
      if (!cancelled) setAutoFetching(false)
    }
    run()
    return () => { cancelled = true }
  }, [fp, meta?.fetched])

  // 触发缩略图生成 + 收集 hash
  useEffect(() => {
    for (const v of videos) {
      const vp = joinPath(fp, v)
      const hashKey = `${vp}|360|240`
      if (thumbHashes[hashKey]) continue // 已有不重复请求
      window.api.getThumbnail(vp, 360, 240).then(hash => {
        if (hash) setThumbHashes(prev => ({ ...prev, [hashKey]: hash }))
      }).catch(() => {})
    }
  }, [videos, fp])

  // 后台扫描视频时长
  useEffect(() => {
    let cancelled = false
    const scan = async () => {
      for (const v of videos) {
        if (cancelled) return
        const vp = joinPath(fp, v)
        const cached = data.videoDurations[vp]
        if (cached != null && cached > 0) {
          setDurations(prev => ({ ...prev, [vp]: cached }))
          continue
        }
        try {
          const r = await window.api.getDuration(vp)
          if (!cancelled && r?.durationSec > 0) {
            setDurations(prev => ({ ...prev, [vp]: r.durationSec }))
          }
        } catch { /* skip */ }
      }
    }
    scan()
    return () => { cancelled = true }
  }, [videos, fp])

  // 累计观看时间
  const totalSec = useMemo(() => {
    let s = 0
    for (const vp of watchedList) {
      s += durations[vp] || data.videoDurations[vp] || 0
    }
    return s
  }, [watchedList, durations, data.videoDurations])

  const sortedVideos = useMemo(() =>
    [...videos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }) * (sortDesc ? -1 : 1))
  , [videos, sortDesc])

  const firstUnwatched = videos.find(v => !watchedList.includes(joinPath(fp, v))) || videos[0]

  // 视频右键菜单
  const videoCtx = useCallback(async (e: React.MouseEvent, vp: string) => {
    e.preventDefault()
    if (selectMode) return
    const isW = watchedList.includes(vp)
    const r = await show([
      { id: 'play', label: '▶ 打开' },
      { id: 'toggle', label: isW ? '✗ 标记未看' : '✓ 标记已看' },
      { id: 'sep1', label: '', type: 'separator' },
      { id: 'open-folder', label: '📂 打开文件位置' },
      { id: 'delete', label: '❌ 删除文件' },
      { id: 'sep2', label: '', type: 'separator' },
      { id: 'selMode', label: '☑ 多选' },
    ])
    if (r === 'play') { window.api.launchPlayer(vp, fp); await markWatched(vp, fp) }
    if (r === 'open-folder') window.api.openFolder(vp)
    if (r === 'delete') { if (await window.api.deleteFile(vp)) doScan() }
    if (r === 'toggle') {
      if (isW) {
        // 标记未看：从 watched 列表移除
        const newList = watchedList.filter(p => p !== vp)
        await (window.api as any).setWatched?.(fp, newList) || clearWatched(fp)
      } else {
        await markWatched(vp, fp)
      }
      refresh()
    }
    if (r === 'selMode') setSelectMode(true)
  }, [selectMode, show, watchedList, fp, markWatched, clearWatched, refresh, doScan])

  // 文件夹右键
  const folderCtx = useCallback(async (e: React.MouseEvent, fPath: string, fName: string) => {
    e.preventDefault()
    const r = await show([
      { id: 'pin', label: data.pinned.includes(fPath) ? '📌 取消置顶' : '📌 置顶' },
      { id: 'hide', label: data.hidden.includes(fPath) ? '👁 取消隐藏' : '👁 隐藏' },
      { id: 'sep', label: '', type: 'separator' },
      { id: 'enter', label: '📂 进入' },
    ])
    if (r === 'pin') { await window.api.togglePin(fPath); doScan() }
    if (r === 'hide') { await window.api.toggleHide(fPath); doScan() }
    if (r === 'enter') push({ path: fPath, name: fName })
  }, [show, data, push, doScan])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 头部 — 复制旧版 _render_header */}
      <div className="border-b shrink-0" style={{ backgroundColor: 'var(--kq-bg-detail)', borderColor: 'var(--kq-border)' }}>
        <div className="flex gap-4 p-5">
          {/* 封面 */}
          <div className="shrink-0 rounded-lg overflow-hidden" style={{ width: 130, height: 185 }}>
            {meta?.cover ? (
              <img src={`kiroq://cover/${meta.cover}`} alt={dn} className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl" style={{ backgroundColor: 'var(--kq-bg-nav)' }}>🎬</div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start gap-2">
              <h1 className="text-xl font-bold truncate" style={{ color: 'var(--kq-text-primary)' }}>{dn}</h1>
              {meta?.link && <a href={meta.link} target="_blank" className="p-1 rounded shrink-0"><ExternalLink size={14} color="var(--kq-text-dim)" /></a>}
            </div>

            {(meta?.rating || meta?.note) && (
              <div className="text-xs" style={{ color: 'var(--kq-text-muted)' }}>
                {meta.rating && `⭐ ${meta.rating}/10`}{meta.rating && meta.note && '  |  '}{meta.note && `💬 ${meta.note}`}
              </div>
            )}

            <div className="text-xs" style={{ color: 'var(--kq-text-muted)' }}>
              {videos.length > 0 && `📺 ${watchedList.length}/${videos.length} 集已看`}
              {subdirs.length > 0 && `  ·  📂 ${subdirs.length} 个子文件夹`}
              {totalSec > 0 && `  ·  ⏱ ${Math.floor(totalSec / 60)} 分钟`}
            </div>

            {meta?.desc ? (
              <div className="p-3 rounded text-xs leading-relaxed max-h-24 overflow-y-auto"
                style={{ backgroundColor: 'var(--kq-desc-bg)', color: 'var(--kq-text-primary)' }}>{meta.desc}</div>
            ) : (
              <div className="text-xs italic" style={{ color: 'var(--kq-empty-text)' }}>暂无简介 — 点 ··· 可编辑</div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {autoFetching && (
                <span className="text-xs" style={{ color: 'var(--kq-accent)' }}>
                  🔍 正在从 Bangumi 获取信息…
                  <button onClick={() => { updateMeta(fp, { fetched: true } as any); setAutoFetching(false) }}
                    className="ml-2 text-xs underline" style={{ color: 'var(--kq-text-dim)' }}>取消</button>
                </span>
              )}
              {firstUnwatched && (
                <button onClick={() => window.api.launchPlayer(joinPath(fp, firstUnwatched), fp)}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-md text-white text-sm font-medium hover:opacity-90 max-w-full"
                  style={{ backgroundColor: 'var(--kq-btn)' }}>
                  <Play size={14} fill="white" className="shrink-0" />
                  <span className="truncate">{watchedList.length > 0 ? `继续看：${firstUnwatched}` : `开始看：${firstUnwatched}`}</span>
                </button>
              )}
            </div>
          </div>

          {/* ··· 菜单 */}
          <button onClick={() => { setEditFolderPath(fp); openModal('edit') }}
            className="shrink-0 px-3 py-1.5 text-xs rounded border hover:opacity-80 h-fit"
            style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>···</button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* 视频列表/宫格 */}
        {videos.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold" style={{ color: 'var(--kq-text-dim)' }}>📺 视频文件</span>
              <div className="flex-1" />
              <select value={sortDesc ? 'desc' : 'asc'} onChange={e => setSortDesc(e.target.value === 'desc')}
                className="px-1.5 py-0.5 text-xs rounded border cursor-pointer"
                style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
                <option value="asc">文件名升序</option>
                <option value="desc">文件名降序</option>
              </select>
              <button onClick={() => { setViewMode(viewMode === 'list' ? 'grid' : 'list'); updateMeta(fp, { videoViewMode: viewMode === 'list' ? 'grid' : 'list' }) }}
                className="p-1 rounded" style={{ color: 'var(--kq-text-primary)' }}>
                {viewMode === 'list' ? <Grid3X3 size={16} /> : <List size={16} />}
              </button>
            </div>

            {viewMode === 'list' ? (
              <div className="space-y-px border rounded overflow-hidden" style={{ borderColor: 'var(--kq-border)' }}>
                {sortedVideos.map((v, i) => {
                  const vp = joinPath(fp, v)
                  const isW = watchedList.includes(vp)
                  const dur = durations[vp] || data.videoDurations[vp]
                  const isSel = sel.has(vp)
                  const rowBg = isSel ? 'var(--kq-accent)' : i % 2 === 0 ? 'var(--kq-row-even)' : 'var(--kq-row-odd)'
                  const textColor = isSel ? '#fff' : isW ? 'var(--kq-watched-text)' : 'var(--kq-text-primary)'
                  return (
                    <div key={v}
                      className="flex items-center gap-2 px-3 py-[7px] text-xs cursor-pointer select-none transition-colors"
                      style={{
                        backgroundColor: rowBg,
                        color: textColor,
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = 'var(--kq-row-hover)' }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
                      onClick={() => {
                        if (selectMode) { setSel(prev => { const n = new Set(prev); n.has(vp) ? n.delete(vp) : n.add(vp); return n }); return }
                      }}
                      onDoubleClick={() => { if (!selectMode) { window.api.launchPlayer(vp, fp); markWatched(vp, fp) } }}
                      onContextMenu={e => videoCtx(e, vp)}>
                      {/* 选择指示器 — 复刻旧版 ●/☑ */}
                      <span className="w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={selectMode ? {
                          backgroundColor: isSel ? 'rgba(255,255,255,0.3)' : 'var(--kq-cb-unchecked)',
                          color: isSel ? '#fff' : 'var(--kq-text-dim)',
                          border: isSel ? '1px solid rgba(255,255,255,0.5)' : '1px solid var(--kq-border)',
                        } : {
                          color: isW ? 'transparent' : 'var(--kq-text-dim)',
                          backgroundColor: 'transparent',
                        }}>
                        {selectMode ? (isSel ? '✓' : '') : (isW ? '' : '●')}
                      </span>
                      <span className="flex-1 truncate">{v}</span>
                      {dur > 0 && <span className="text-[10px] shrink-0 opacity-70" style={{ color: isSel ? 'rgba(255,255,255,0.8)' : 'var(--kq-text-dim)' }}>{fmtDur(dur)}</span>}
                      {isW && <span className="text-[10px] shrink-0 opacity-80" style={{ color: isSel ? 'rgba(255,255,255,0.9)' : 'var(--kq-watched-fg)' }}>✓ 已看</span>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {sortedVideos.map(v => {
                  const vp = joinPath(fp, v); const isW = watchedList.includes(vp)
                  const dur = durations[vp] || data.videoDurations[vp]
                  return (
                    <div key={v} className="rounded-lg border overflow-hidden cursor-pointer relative transition-colors duration-150"
                      style={{ borderColor: sel.has(vp) ? 'var(--kq-accent)' : 'var(--kq-border)', borderWidth: sel.has(vp) ? 2 : 1, backgroundColor: 'var(--kq-bg-card)' }}
                      onMouseEnter={e => { if (!sel.has(vp)) e.currentTarget.style.borderColor = 'var(--kq-border-hover)' }}
                      onMouseLeave={e => { if (!sel.has(vp)) e.currentTarget.style.borderColor = 'var(--kq-border)' }}
                      onClick={() => { if (selectMode) setSel(prev => { const n = new Set(prev); n.has(vp) ? n.delete(vp) : n.add(vp); return n }) }}
                      onDoubleClick={() => { if (!selectMode) { window.api.launchPlayer(vp, fp); markWatched(vp, fp) } }}
                      onContextMenu={e => videoCtx(e, vp)}>
                      {selectMode && (
                        <div className="absolute top-1 left-1 w-[22px] h-[22px] rounded flex items-center justify-center text-xs font-bold z-10"
                          style={{ backgroundColor: sel.has(vp) ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)', color: sel.has(vp) ? '#fff' : 'transparent' }}>
                          {sel.has(vp) ? '✓' : ''}
                        </div>
                      )}
                      <div className="w-full h-[120px] relative overflow-hidden" style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
                        {thumbHashes[`${vp}|360|240`] && !thumbFailed[`${vp}|360|240`] ? (
                          <img key={thumbRetry[`${vp}|360|240`] || 0}
                            src={`kiroq://thumbnail/${thumbHashes[`${vp}|360|240`]}`} alt={v}
                            className="w-full h-full object-cover"
                            onError={() => handleThumbError(`${vp}|360|240`)} />
                        ) : null}
                        {(!thumbHashes[`${vp}|360|240`] || thumbFailed[`${vp}|360|240`]) && (
                          <div className="absolute inset-0 flex items-center justify-center text-3xl">🎞️</div>
                        )}
                        {dur > 0 && <span className="absolute bottom-1 right-1 px-1 text-[10px] rounded" style={{ backgroundColor: '#111', color: '#eee' }}>{fmtDur(dur)}</span>}
                      </div>
                      {isW && <div className="text-center text-[10px] py-0.5" style={{ backgroundColor: 'var(--kq-watched-bg)', color: 'var(--kq-watched-fg)' }}>✓ 已看</div>}
                      <div className="p-2 text-[11px] font-medium leading-snug line-clamp-3" style={{ color: 'var(--kq-text-primary)' }} title={v}>{v}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 子文件夹 */}
        {subdirs.length > 0 && (
          <>
            {videos.length > 0 && <hr style={{ borderColor: 'var(--kq-sep-color)' }} />}
            <div>
              <span className="text-sm font-bold" style={{ color: 'var(--kq-text-dim)' }}>📂 子文件夹</span>
              <div className="mt-2 flex flex-wrap gap-3">
                {subdirs.map(d => {
                  const sfp = joinPath(fp, d)
                  const smeta = data.folderMeta[sfp] || null
                  const swl = data.watched[sfp] || []
                  return (
                    <AnimeCard
                      key={sfp}
                      folderPath={sfp}
                      displayName={smeta?.name || cleanDisplayName(d)}
                      meta={smeta}
                      isPinned={data.pinned.includes(sfp)}
                      isHidden={data.hidden.includes(sfp)}
                      watchedCount={swl.length}
                      totalVideos={0}
                      onEnter={() => push({ path: sfp, name: smeta?.name || d })}
                      onContextMenu={e => folderCtx(e, sfp, smeta?.name || d)}
                      enableAnimation={false}
                    />
                  )
                })}
              </div>
            </div>
          </>
        )}

        {subdirs.length === 0 && videos.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--kq-empty-text)' }}>这个文件夹是空的</div>
        )}
      </div>

      {/* 多选操作栏 */}
      {selectMode && (
        <div className="h-11 flex items-center px-3 gap-2 border-t shrink-0"
          style={{ backgroundColor: 'var(--kq-bg-toolbar)', borderColor: 'var(--kq-border)' }}>
          <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>已选 {sel.size} 项</span>
          <button onClick={() => setSel(new Set(videos.map(v => joinPath(fp, v))))}
            className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>全选</button>
          <button onClick={() => setSel(new Set())}
            className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>取消</button>
          <button onClick={async () => {
            for (const vp of sel) await markWatched(vp, fp)
            setSelectMode(false); setSel(new Set()); refresh()
          }} className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>✓ 标记已看</button>
          <button onClick={async () => {
            // 标记未看
            for (const vp of sel) await clearWatched(fp)
            setSelectMode(false); setSel(new Set()); refresh()
          }} className="px-2 py-1 text-xs rounded text-white" style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>✗ 标记未看</button>
          <button onClick={() => { setSelectMode(false); setSel(new Set()) }}
            className="px-2 py-1 text-xs rounded text-white ml-auto" style={{ backgroundColor: 'var(--kq-accent)' }}>完成</button>
        </div>
      )}
    </div>
  )
}
