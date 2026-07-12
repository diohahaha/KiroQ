/**
 * 设置弹窗 — 已核对旧版 dialogs.py SettingsDialog
 * ── 本版追加：图片库根目录 / 图片-压缩包查看器 / 电子书阅读器 / 默认库 / 过滤 / 标签管理 ──
 */
import { useState, useEffect, useRef } from 'react'
import { FolderOpen, MonitorPlay, Image as ImageIcon, BookOpen } from 'lucide-react'
import { Modal } from '@/components/common/Modal'
import { ThemeSwitcher } from '@/components/common/ThemeSwitcher'
import { useSettingsStore } from '@/state/settingsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useImageLibraryStore } from '@/state/imageLibraryStore'
import { joinPath } from '@/utils/path'
import { cleanSearchKeyword } from '@/utils/cleanName'
import type { ImageTagDef } from '@shared/types'

interface Props { open: boolean; onClose: () => void }

export function SettingsDialog({ open, onClose }: Props) {
  const settings = useSettingsStore()
  const setRoot = useLibraryStore(s => s.setRoot)
  const imageStore = useImageLibraryStore()
  const [libraryRoot, setLibraryRoot] = useState('')
  const [playerPath, setPlayerPath] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [autoFilter, setAutoFilter] = useState(true)
  const [autoFetch, setAutoFetch] = useState(true)
  const [filterKeywords, setFilterKeywords] = useState('')

  // ── 图片库相关本地状态 ──
  const [imageRoot, setImageRootLocal] = useState('')
  const [imageViewerPath, setImageViewerPath] = useState('')
  const [ebookViewerPath, setEbookViewerPath] = useState('')
  const [defaultLibraryMode, setDefaultLibraryMode] = useState<'video' | 'image'>('video')
  const [imgAutoFilterEmpty, setImgAutoFilterEmpty] = useState(true)
  const [imgFilterKeywords, setImgFilterKeywords] = useState('')
  const [imgTypeFilter, setImgTypeFilter] = useState({ image: true, archive: true, ebook: true })
  const [tagDefs, setTagDefs] = useState<ImageTagDef[]>([])
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagType, setNewTagType] = useState<'color' | 'text'>('color')
  const [newTagColor, setNewTagColor] = useState('#3a6eaa')

  const [refetchProgress, setRefetchProgress] = useState('')
  const [clearingCache, setClearingCache] = useState(false)
  const [clearCacheResult, setClearCacheResult] = useState('')

  const handleClearThumbnailCache = async () => {
    setClearingCache(true)
    setClearCacheResult('')
    try {
      const { deleted } = await window.api.imageClearThumbnailCache()
      setClearCacheResult(`✅ 已清空 ${deleted} 个缓存文件，重新进入文件夹会自动重新生成`)
    } catch {
      setClearCacheResult('❌ 清空失败，可以手动去 %APPDATA%/KiroQ/thumbnails 删')
    } finally {
      setClearingCache(false)
    }
  }
  const cancelRefetch = useRef(false)
  const [fetchSource, setFetchSource] = useState(() => localStorage.getItem('kiroq-last-source') || 'bangumi')
  const [fetchSources, setFetchSources] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('kiroq-sources') || '[]') } catch { return [] } })
  const [showFetchMgr, setShowFetchMgr] = useState(false)
  const [newFName, setNewFName] = useState('')
  const [newFUrl, setNewFUrl] = useState('')

  const saveFetchSources = (list: any[]) => { setFetchSources(list); localStorage.setItem('kiroq-sources', JSON.stringify(list)) }
  const addFetchSource = () => {
    const n = newFName.trim(); if (!n) return
    saveFetchSources([...fetchSources.filter((s: any) => s.name !== n), { name: n, apiUrl: newFUrl.trim() }])
    setNewFName(''); setNewFUrl('')
  }
  const removeFetchSource = (name: string) => {
    saveFetchSources(fetchSources.filter((s: any) => s.name !== name))
    if (fetchSource === name) { setFetchSource('bangumi'); localStorage.setItem('kiroq-last-source', 'bangumi') }
  }

  const doRefetch = async (onlyUnfetched: boolean) => {
    const libData = useLibraryStore.getState().data
    if (!libData.root) return
    const { subdirs } = await window.api.scanFolder(libData.root)
    cancelRefetch.current = false
    let done = 0; let skipped = 0; let fetched = 0
    setRefetchProgress(`正在抓取… 0/${subdirs.length}`)
    for (const d of subdirs) {
      if (cancelRefetch.current) { setRefetchProgress(`已取消 (${done}/${subdirs.length})`); return }
      const fp = joinPath(libData.root, d)
      const meta = libData.folderMeta[fp]
      if (onlyUnfetched && meta?.fetched) { skipped++; done++; continue }
      const kw = cleanSearchKeyword(meta?.name || d)
      try {
        let results
        if (fetchSource === 'bangumi') {
          results = await window.api.bangumiSearch(kw)
        } else {
          const cs = fetchSources.find((s: any) => s.name === fetchSource)
          if (!cs?.apiUrl) { done++; continue }
          const url = cs.apiUrl.replace('{keyword}', encodeURIComponent(kw))
          const raw = await window.api.genericFetchJson(url)
          if (!raw) { done++; continue }
          const list = Array.isArray(raw) ? raw : (raw.data || raw.results || [])
          results = list.map((item: any) => ({
            id: item.mal_id || item.id, name: item.title || item.name || '',
            name_cn: item.title_english || item.title || item.name_cn || item.name || '',
            image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.image || '',
            summary: item.synopsis || item.summary || '', rating: item.score || item.rating || null,
          }))
        }
        if (cancelRefetch.current) { setRefetchProgress(`已取消 (${done}/${subdirs.length})`); return }
        if (results && results.length > 0) {
          const match = results[0]
          const item = fetchSource === 'bangumi' ? ((await window.api.bangumiGetSubject(match.id)) || match) : match
          let cover = (item.image ? await window.api.bangumiDownloadCover(item.image, fp) : null) || meta?.cover || null
          const patch: any = {
            name: item.name_cn || item.name,
            desc: item.summary || '',
            link: `https://bgm.tv/subject/${item.id}`,
            rating: item.rating ?? null,
            cover,
            bgmId: item.id,
            fetched: true,
            source: 'bangumi',
          }
          useLibraryStore.getState().updateMeta(fp, patch)
          fetched++
        } else if (!meta?.fetched) {
          useLibraryStore.getState().updateMeta(fp, { fetched: true } as any)
        }
      } catch { /* skip */ }
      done++
      setRefetchProgress(`正在抓取… ${done}/${subdirs.length}`)
    }
    setRefetchProgress(`✅ 完成！${subdirs.length} 个文件夹，成功抓取 ${fetched}，跳过 ${skipped}`)
  }

  useEffect(() => {
    if (open) {
      setLibraryRoot(settings.libraryRoots[0] || '')
      setPlayerPath(settings.playerPath || '')
      setShowHidden(settings.showHidden)
      setAutoFilter(settings.autoFilter)
      setAutoFetch(settings.autoFetch)
      setFilterKeywords(settings.filterKeywords)

      setImageRootLocal(imageStore.data.root || '')
      setImageViewerPath(settings.imageViewerPath || '')
      setEbookViewerPath(settings.ebookViewerPath || '')
      setDefaultLibraryMode(settings.defaultLibraryMode)
      setImgAutoFilterEmpty(imageStore.data.autoFilterEmpty)
      setImgFilterKeywords(imageStore.data.filterKeywords)
      setImgTypeFilter(imageStore.data.typeFilter)
      setTagDefs(imageStore.data.tagDefs)
    }
  }, [open, settings, imageStore.data])

  const handlePickFolder = async () => {
    const path = await window.api.pickFolder()
    if (path) {
      setLibraryRoot(path)
      await setRoot(path)
      settings.save({ libraryRoots: [path] })
    }
  }

  const handlePickPlayer = async () => {
    const path = await window.api.pickPlayer()
    if (path) {
      setPlayerPath(path)
      settings.save({ playerPath: path })
    }
  }

  const handlePickImageRoot = async () => {
    const path = await window.api.pickFolder()
    if (path) {
      setImageRootLocal(path)
      await imageStore.setRoot(path)
    }
  }

  const handlePickImageViewer = async () => {
    const path = await window.api.pickImageViewer()
    if (path) { setImageViewerPath(path); settings.save({ imageViewerPath: path }) }
  }

  const handlePickEbookViewer = async () => {
    const path = await window.api.pickEbookViewer()
    if (path) { setEbookViewerPath(path); settings.save({ ebookViewerPath: path }) }
  }

  const handleAddTag = () => {
    const label = newTagLabel.trim()
    if (!label) return
    const next: ImageTagDef[] = [...tagDefs, {
      id: `tag_${Date.now()}`, label, type: newTagType, color: newTagColor,
    }]
    setTagDefs(next)
    imageStore.saveTagDefs(next)
    setNewTagLabel('')
  }

  const handleUpdateTag = (id: string, partial: Partial<ImageTagDef>) => {
    const next = tagDefs.map(t => t.id === id ? { ...t, ...partial } : t)
    setTagDefs(next)
    imageStore.saveTagDefs(next)
  }

  const handleRemoveTag = (id: string) => {
    const next = tagDefs.filter(t => t.id !== id)
    setTagDefs(next)
    imageStore.saveTagDefs(next)
  }

  const handleSave = () => {
    settings.save({
      showHidden, autoFilter, autoFetch, filterKeywords,
      imageViewerPath, ebookViewerPath, defaultLibraryMode,
    })
    imageStore.saveFilter({
      autoFilterEmpty: imgAutoFilterEmpty,
      filterKeywords: imgFilterKeywords,
      typeFilter: imgTypeFilter,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[500px]" closeOnOverlay={false}>
      <div className="flex flex-col max-h-[85vh]">
        {/* 固定头部：不随内容滚动，右上角 ✕ 始终可见可点 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b" style={{ borderColor: 'var(--kq-border)' }}>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--kq-text-primary)' }}>设置</h3>
          <button onClick={onClose} className="text-sm hover:opacity-70 px-1" style={{ color: 'var(--kq-text-dim)' }}>✕</button>
        </div>

        {/* 可滚动内容区 */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
        {/* 主题 */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>主题方案</h4>
          <ThemeSwitcher />
        </section>

        {/* 启动默认库 */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>启动时默认打开</h4>
          <div className="flex gap-2">
            <button onClick={() => setDefaultLibraryMode('video')}
              className="flex-1 px-3 py-1.5 text-xs rounded border"
              style={{
                borderColor: defaultLibraryMode === 'video' ? 'var(--kq-accent)' : 'var(--kq-border)',
                backgroundColor: defaultLibraryMode === 'video' ? 'var(--kq-accent)' : 'transparent',
                color: defaultLibraryMode === 'video' ? '#fff' : 'var(--kq-text-primary)',
              }}>📹 视频库</button>
            <button onClick={() => setDefaultLibraryMode('image')}
              className="flex-1 px-3 py-1.5 text-xs rounded border"
              style={{
                borderColor: defaultLibraryMode === 'image' ? 'var(--kq-accent)' : 'var(--kq-border)',
                backgroundColor: defaultLibraryMode === 'image' ? 'var(--kq-accent)' : 'transparent',
                color: defaultLibraryMode === 'image' ? '#fff' : 'var(--kq-text-primary)',
              }}>🖼️ 图片库</button>
          </div>
        </section>

        {/* 视频库根目录 */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>视频库根目录</h4>
          <div className="flex items-center gap-2">
            <button onClick={handlePickFolder} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border hover:opacity-80" style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <FolderOpen size={14} /> 选择文件夹
            </button>
            <span className="text-xs truncate max-w-[280px]" style={{ color: 'var(--kq-text-dim)' }}>
              {libraryRoot || '未设置'}
            </span>
          </div>
        </section>

        {/* 播放器 */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>外部播放器</h4>
          <div className="flex items-center gap-2">
            <button onClick={handlePickPlayer} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border hover:opacity-80" style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <MonitorPlay size={14} /> 选择播放器
            </button>
            <span className="text-xs truncate max-w-[280px]" style={{ color: 'var(--kq-text-dim)' }}>
              {playerPath || '系统默认'}
            </span>
          </div>
        </section>

        {/* ══════════ 图片库 ══════════ */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>图片库根目录</h4>
          <div className="flex items-center gap-2">
            <button onClick={handlePickImageRoot} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border hover:opacity-80" style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <FolderOpen size={14} /> 选择文件夹
            </button>
            <span className="text-xs truncate max-w-[280px]" style={{ color: 'var(--kq-text-dim)' }}>
              {imageRoot || '未设置'}
            </span>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>图片/压缩包查看器</h4>
          <div className="flex items-center gap-2">
            <button onClick={handlePickImageViewer} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border hover:opacity-80" style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <ImageIcon size={14} /> 选择程序
            </button>
            <span className="text-xs truncate max-w-[260px]" style={{ color: 'var(--kq-text-dim)' }}>
              {imageViewerPath || '系统默认'}
            </span>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>电子书阅读器</h4>
          <div className="flex items-center gap-2">
            <button onClick={handlePickEbookViewer} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border hover:opacity-80" style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <BookOpen size={14} /> 选择程序
            </button>
            <span className="text-xs truncate max-w-[260px]" style={{ color: 'var(--kq-text-dim)' }}>
              {ebookViewerPath || '系统默认'}
            </span>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>诊断</h4>
          <div className="flex items-center gap-2">
            <button onClick={() => window.api.imageOpenErrorLog()}
              className="px-3 py-1.5 text-xs rounded border hover:opacity-80"
              style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              📋 打开封面失败日志
            </button>
            <span className="text-[11px]" style={{ color: 'var(--kq-text-dim)' }}>
              压缩包/epub 封面提取失败的原因会记在这里
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={handleClearThumbnailCache}
              disabled={clearingCache}
              className="px-3 py-1.5 text-xs rounded border hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              🗑 {clearingCache ? '清空中…' : '清空缩略图缓存'}
            </button>
            <span className="text-[11px]" style={{ color: clearCacheResult ? 'var(--kq-accent)' : 'var(--kq-text-dim)' }}>
              {clearCacheResult || '视频缩略图 + 图片库封面都会重新生成，改了尺寸设置之后用这个刷新旧缓存'}
            </span>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>图片库过滤</h4>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>空文件夹自动隐藏</span>
            <input type="checkbox" checked={imgAutoFilterEmpty} onChange={e => setImgAutoFilterEmpty(e.target.checked)}
              className="w-4 h-4 rounded" />
          </label>

          <div>
            <span className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>自定义过滤关键词（逗号分隔，精确匹配文件夹名）</span>
            <input value={imgFilterKeywords} onChange={e => setImgFilterKeywords(e.target.value)}
              placeholder="例如: 临时, 待整理"
              className="w-full mt-1 px-2 py-1.5 text-xs rounded border outline-none"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs" style={{ color: 'var(--kq-text-primary)' }}>
              <input type="checkbox" checked={imgTypeFilter.image}
                onChange={e => setImgTypeFilter(f => ({ ...f, image: e.target.checked }))} className="w-3.5 h-3.5" />
              图片
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs" style={{ color: 'var(--kq-text-primary)' }}>
              <input type="checkbox" checked={imgTypeFilter.archive}
                onChange={e => setImgTypeFilter(f => ({ ...f, archive: e.target.checked }))} className="w-3.5 h-3.5" />
              压缩包
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs" style={{ color: 'var(--kq-text-primary)' }}>
              <input type="checkbox" checked={imgTypeFilter.ebook}
                onChange={e => setImgTypeFilter(f => ({ ...f, ebook: e.target.checked }))} className="w-3.5 h-3.5" />
              电子书
            </label>
          </div>
        </section>

        {/* 标签管理 */}
        <section className="space-y-2">
          <h4 className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>图片库标签</h4>
          <div className="space-y-1.5">
            {tagDefs.map(tag => (
              <div key={tag.id} className="flex items-center gap-2">
                <select value={tag.type} onChange={e => handleUpdateTag(tag.id, { type: e.target.value as 'color' | 'text' })}
                  className="px-1.5 py-1 text-xs rounded border" style={{ borderColor: 'var(--kq-border)', backgroundColor: 'var(--kq-bg-card)', color: 'var(--kq-text-primary)' }}>
                  <option value="color">颜色</option>
                  <option value="text">文字</option>
                </select>
                <input type="color" value={tag.color} onChange={e => handleUpdateTag(tag.id, { color: e.target.value })}
                  className="w-7 h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--kq-border)' }} />
                <input value={tag.label} onChange={e => handleUpdateTag(tag.id, { label: e.target.value })}
                  className="flex-1 px-2 py-1 text-xs rounded border outline-none"
                  style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
                <button onClick={() => handleRemoveTag(tag.id)} className="text-xs hover:opacity-70" style={{ color: '#cc6666' }}>删除</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <select value={newTagType} onChange={e => setNewTagType(e.target.value as 'color' | 'text')}
              className="px-1.5 py-1 text-xs rounded border" style={{ borderColor: 'var(--kq-border)', backgroundColor: 'var(--kq-bg-card)', color: 'var(--kq-text-primary)' }}>
              <option value="color">颜色</option>
              <option value="text">文字</option>
            </select>
            <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
              className="w-7 h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--kq-border)' }} />
            <input value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
              placeholder="新标签名称" className="flex-1 px-2 py-1 text-xs rounded border outline-none"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
            <button onClick={handleAddTag} className="px-2 py-1 text-xs rounded text-white shrink-0" style={{ backgroundColor: 'var(--kq-accent)' }}>新增</button>
          </div>
        </section>

        {/* 显示 */}
        <section className="space-y-3">
          <h4 className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>显示（视频库）</h4>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>显示已隐藏的番剧</span>
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)}
              className="w-4 h-4 rounded" />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>自动过滤非番剧文件夹</span>
            <input type="checkbox" checked={autoFilter} onChange={e => setAutoFilter(e.target.checked)}
              className="w-4 h-4 rounded" />
          </label>

          <div>
            <span className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>过滤关键词（逗号分隔）</span>
            <input value={filterKeywords} onChange={e => setFilterKeywords(e.target.value)}
              placeholder="例如: ova, spec, cm, creditless"
              className="w-full mt-1 px-2 py-1.5 text-xs rounded border outline-none"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
          </div>
        </section>

        {/* 抓取 */}
        <section className="space-y-3">
          <h4 className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>抓取（视频库）</h4>

          <div className="flex items-center gap-2">
            <select value={fetchSource} onChange={e => { setFetchSource(e.target.value); localStorage.setItem('kiroq-last-source', e.target.value) }}
              className="px-2 py-1 text-xs rounded border cursor-pointer"
              style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <option value="bangumi">Bangumi</option>
              {fetchSources.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <button onClick={() => setShowFetchMgr(!showFetchMgr)}
              className="text-xs underline hover:opacity-70" style={{ color: 'var(--kq-text-dim)' }}>
              {showFetchMgr ? '关闭' : '管理'}
            </button>
          </div>

          {showFetchMgr && (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
              {fetchSources.map((s: any) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span style={{ color: 'var(--kq-text-primary)' }}>{s.name}</span>
                  <span className="truncate" style={{ color: 'var(--kq-text-dim)' }}>{s.apiUrl || '（使用内置 API）'}</span>
                  <div className="flex-1" />
                  <button onClick={() => removeFetchSource(s.name)}
                    className="text-xs hover:opacity-70" style={{ color: '#cc6666' }}>删除</button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newFName} onChange={e => setNewFName(e.target.value)}
                  placeholder="来源名称" className="flex-1 px-2 py-1 text-xs rounded border outline-none"
                  style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
                <input value={newFUrl} onChange={e => setNewFUrl(e.target.value)}
                  placeholder="API 地址（可选）" className="flex-[2] px-2 py-1 text-xs rounded border outline-none"
                  style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
                <button onClick={addFetchSource}
                  className="px-2 py-1 text-xs rounded text-white shrink-0"
                  style={{ backgroundColor: 'var(--kq-accent)' }}>添加</button>
              </div>
            </div>
          )}

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs" style={{ color: 'var(--kq-text-primary)' }}>进入新文件夹时自动抓取</span>
            <input type="checkbox" checked={autoFetch} onChange={e => setAutoFetch(e.target.checked)}
              className="w-4 h-4 rounded" />
          </label>
          {refetchProgress && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--kq-accent)' }}>{refetchProgress}</span>
              {!refetchProgress.startsWith('✅') && (
                <button onClick={() => cancelRefetch.current = true}
                  className="text-xs underline" style={{ color: 'var(--kq-text-dim)' }}>取消</button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => doRefetch(false)}
              className="px-2.5 py-1.5 text-xs rounded-md text-white hover:opacity-90"
              style={{ backgroundColor: 'var(--kq-btn)' }}>
              🔄 重新抓取全部
            </button>
            <button onClick={() => doRefetch(true)}
              className="px-2.5 py-1.5 text-xs rounded-md text-white hover:opacity-90"
              style={{ backgroundColor: 'var(--kq-btn-toggle-a)' }}>
              🆕 仅未抓取的
            </button>
          </div>
        </section>
        </div>

        {/* 固定底部按钮栏 */}
        <div className="flex justify-end gap-3 px-6 py-4 shrink-0 border-t" style={{ borderColor: 'var(--kq-border)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border hover:opacity-80"
            style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>取消</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm rounded-md text-white font-medium hover:opacity-90"
            style={{ backgroundColor: 'var(--kq-accent)' }}>完成</button>
        </div>
      </div>
    </Modal>
  )
}
