/**
 * 设置弹窗 — 已核对旧版 dialogs.py SettingsDialog
 */
import { useState, useEffect, useRef } from 'react'
import { FolderOpen, MonitorPlay } from 'lucide-react'
import { Modal } from '@/components/common/Modal'
import { ThemeSwitcher } from '@/components/common/ThemeSwitcher'
import { useSettingsStore } from '@/state/settingsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { joinPath } from '@/utils/path'
import { cleanSearchKeyword } from '@/utils/cleanName'

interface Props { open: boolean; onClose: () => void }

export function SettingsDialog({ open, onClose }: Props) {
  const settings = useSettingsStore()
  const setRoot = useLibraryStore(s => s.setRoot)
  const [libraryRoot, setLibraryRoot] = useState('')
  const [playerPath, setPlayerPath] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [autoFilter, setAutoFilter] = useState(true)
  const [autoFetch, setAutoFetch] = useState(true)
  const [filterKeywords, setFilterKeywords] = useState('')

  const [refetchProgress, setRefetchProgress] = useState('')
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
    const label = onlyUnfetched ? '未抓取的' : ''
    let done = 0; let skipped = 0; let fetched = 0
    setRefetchProgress(`正在抓取… 0/${subdirs.length}`)
    for (const d of subdirs) {
      if (cancelRefetch.current) { setRefetchProgress(`已取消 (${done}/${subdirs.length})`); return }
      const fp = joinPath(libData.root, d)
      const meta = libData.folderMeta[fp]
      // 只抓取未抓取过的 → 跳过已抓取的
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
          // 下载新封面（覆盖旧图）
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

    }
  }, [open, settings])

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

  const handleSave = () => {
    settings.save({
      showHidden, autoFilter, autoFetch, filterKeywords,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[500px]" closeOnOverlay={false}>
      <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--kq-text-primary)' }}>设置</h3>
          <button onClick={onClose} className="text-sm hover:opacity-70 px-1" style={{ color: 'var(--kq-text-dim)' }}>✕</button>
        </div>

        {/* 主题 */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>主题方案</h4>
          <ThemeSwitcher />
        </section>

        {/* 库根目录 */}
        <section>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--kq-text-dim)' }}>库根目录</h4>
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

        {/* 显示 */}
        <section className="space-y-3">
          <h4 className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>显示</h4>

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
          <h4 className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>抓取</h4>

          {/* 数据来源选择 */}
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

          {/* 来源管理面板 */}
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

        {/* 按钮 */}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border hover:opacity-80"
            style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>取消</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm rounded-md text-white font-medium hover:opacity-90"
            style={{ backgroundColor: 'var(--kq-accent)' }}>完成</button>
        </div>
      </div>
    </Modal>
  )
}
