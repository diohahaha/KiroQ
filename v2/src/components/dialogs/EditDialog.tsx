/**
 * 编辑番剧信息 — 搜索 + 数据来源管理
 */
import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/common/Modal'
import type { AnimeFolder } from '@shared/types'
import { STATUS_OPTIONS } from '@shared/types'
import { cleanSearchKeyword } from '@/utils/cleanName'

interface CustomSource { name: string; apiUrl: string }

function loadSources(): CustomSource[] {
  try { return JSON.parse(localStorage.getItem('kiroq-sources') || '[]') } catch { return [] }
}
function saveSources(s: CustomSource[]) {
  localStorage.setItem('kiroq-sources', JSON.stringify(s))
}

interface Props {
  open: boolean; folderPath: string | null; meta: AnimeFolder | null
  onSave: (partial: Partial<AnimeFolder>) => void; onClose: () => void
}

export function EditDialog({ open, folderPath, meta, onSave, onClose }: Props) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState('')
  const [link, setLink] = useState(''); const [note, setNote] = useState('')
  const [rating, setRating] = useState(''); const [status, setStatus] = useState('')
  const [source, setSource] = useState('bangumi')
  const [cover, setCover] = useState('')
  const [searchKw, setSearchKw] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [customSources, setCustomSources] = useState<CustomSource[]>(loadSources)
  const [showManager, setShowManager] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')

  useEffect(() => {
    setName(meta?.name || '')
    setDesc(meta?.desc || '')
    setLink(meta?.link || '')
    setNote(meta?.note || '')
    setRating(meta?.rating != null ? String(meta.rating) : '')
    setStatus(meta?.status || '')
    setSource(localStorage.getItem('kiroq-last-source') || 'bangumi')
    setCover(meta?.cover || '')
    setSearchKw(meta?.name || folderPath?.split('\\').pop() || '')
    setSearchResults([])
    setSearchError('')
    setSearching(false)
    setShowManager(false)
    setCustomSources(loadSources())
  }, [open, folderPath, meta])

  // 记住上次选的数据来源
  useEffect(() => { localStorage.setItem('kiroq-last-source', source) }, [source])

  const doSearch = useCallback(async () => {
    if (!searchKw.trim()) return
    setSearching(true)
    setSearchError('')
    setSearchResults([])
    try {
      if (source === 'bangumi') {
        const results = await window.api.bangumiSearch(searchKw.trim())
        setSearchResults(results || [])
        if (!results || results.length === 0) setSearchError('没有找到结果，换个关键词试试')
      } else {
        const cs = customSources.find(s => s.name === source)
        if (!cs?.apiUrl) { setSearchError('该来源未配置 API 地址'); setSearching(false); return }
        const url = cs.apiUrl.replace('{keyword}', encodeURIComponent(searchKw.trim()))
        const raw = await window.api.genericFetchJson(url)
        if (!raw) { setSearchError('请求失败，请检查 API 地址'); setSearching(false); return }
        let list = Array.isArray(raw) ? raw : (raw.data || raw.results || [])
        if (list.length === 0) { setSearchError('没有找到结果'); setSearching(false); return }
        // 字段映射：Jikan / AniList 等不同格式 → 统一格式
        setSearchResults(list.map((item: any) => ({
          id: item.mal_id || item.id,
          name: item.title || item.name || '',
          name_cn: item.title_english || item.title || item.name_cn || item.name || '',
          image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.image || '',
          summary: item.synopsis || item.summary || '',
          air_date: item.aired?.from?.slice(0, 4) || item.year || item.air_date || '',
          eps: item.episodes || item.eps || 0,
          rating: item.score || item.rating || null,
        })))
      }
    } catch (e: any) {
      setSearchError(`搜索失败：${e.message || '未知错误'}`)
    }
    setSearching(false)
  }, [searchKw, source, customSources])

  const applyBangumi = useCallback(async (match: any) => {
    // 只有 Bangumi 才调 getSubject 拿完整信息，其他来源直接用搜索结果
    const item = source === 'bangumi'
      ? ((await window.api.bangumiGetSubject(match.id)) || match)
      : match
    setName(item.name_cn || item.name || name)
    setDesc(item.summary || desc)
    setLink(source === 'bangumi' ? `https://bgm.tv/subject/${item.id}` : (match.url || ''))
    if ((item.rating ?? 0) > 0) setRating(String(item.rating))
    setSearchResults([])
    setSearchError('')
    // 下载封面（异步，不阻塞）
    let coverPath = null
    if (item.image && folderPath) {
      coverPath = await window.api.bangumiDownloadCover(item.image, folderPath)
    }
    onSave({
      name: item.name_cn || item.name || name,
      desc: item.summary || desc,
      link: source === 'bangumi' ? `https://bgm.tv/subject/${item.id}` : (match.link || match.url || ''),
      rating: item.rating ?? null,
      cover: coverPath || undefined,
      bgmId: source === 'bangumi' ? item.id : undefined,
      source,
      fetched: true,
    })
    onClose()
  }, [name, desc, folderPath, source, onSave, onClose, customSources])

  const addSource = () => {
    const n = newName.trim()
    if (!n) return
    const updated = [...customSources.filter(s => s.name !== n), { name: n, apiUrl: newUrl.trim() }]
    setCustomSources(updated)
    saveSources(updated)
    setNewName('')
    setNewUrl('')
  }

  const removeSource = (name: string) => {
    const updated = customSources.filter(s => s.name !== name)
    setCustomSources(updated)
    saveSources(updated)
    if (source === name) setSource('bangumi')
  }

  const handleSave = () => {
    onSave({ name: name.trim(), desc: desc.trim(), link: link.trim(), note: note.trim(), rating: rating ? parseFloat(rating) : null, status: status as AnimeFolder['status'], source, cover: cover || undefined, fetched: true })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[580px]" closeOnOverlay={false}>
      <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--kq-text-primary)' }}>编辑番剧信息</h3>
          <button onClick={onClose} className="text-sm hover:opacity-70 px-1" style={{ color: 'var(--kq-text-dim)' }}>✕</button>
        </div>

        {/* 搜索栏 */}
        <div className="flex gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
          <input value={searchKw} onChange={e => setSearchKw(e.target.value)}
            placeholder="输入番剧名…"
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            className="flex-1 px-2 py-1.5 text-xs rounded border outline-none"
            style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
          {searchKw && (
            <button onClick={() => { setSearchKw(''); setSearchResults([]); setSearchError('') }}
              className="text-xs hover:opacity-70 px-1" style={{ color: 'var(--kq-text-dim)' }}>✕</button>
          )}
          <button onClick={doSearch} disabled={searching}
            className="px-3 py-1.5 text-xs rounded text-white font-medium"
            style={{ backgroundColor: 'var(--kq-accent)' }}>
            {searching ? '搜索中…' : '🔍 搜索'}
          </button>
        </div>

        {/* 搜索错误 */}
        {searchError && (
          <div className="text-xs px-2 py-1 rounded" style={{ color: '#cc6666', backgroundColor: 'var(--kq-bg-nav)' }}>{searchError}</div>
        )}

        {/* 搜索结果 */}
        {searchResults.length > 0 && (
          <div className="space-y-px border rounded overflow-hidden max-h-[200px] overflow-y-auto" style={{ borderColor: 'var(--kq-border)' }}>
            {searchResults.map((item: any, i: number) => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer select-none transition-colors"
                style={{ backgroundColor: i % 2 === 0 ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--kq-row-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
                onClick={() => applyBangumi(item)}>
                {item.image && <img src={item.image} alt="" className="w-10 h-14 rounded object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" style={{ color: 'var(--kq-text-primary)' }}>{item.name_cn || item.name}</div>
                  <div style={{ color: 'var(--kq-text-dim)' }}>
                    {[item.air_date, item.eps > 0 && `${item.eps}话`, item.rating > 0 && `⭐${item.rating}`].filter(Boolean).join('  ·  ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 表单 */}
        <div className="space-y-3">
          <div>
            <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>显示名称</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md text-sm border outline-none"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>外部链接</label>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://bgm.tv/subject/..."
              className="w-full mt-1 px-3 py-2 rounded-md text-sm border outline-none"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>评分 (0-10)</label>
              <input value={rating} onChange={e => setRating(e.target.value)} placeholder="8.5"
                className="w-full mt-1 px-3 py-2 rounded-md text-sm border outline-none"
                style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
            </div>
            <div className="flex-1">
              <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>备注</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="随便写点什么…"
                className="w-full mt-1 px-3 py-2 rounded-md text-sm border outline-none"
                style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>简介</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
              className="w-full mt-1 px-3 py-2 rounded-md text-sm border outline-none resize-none"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>标签</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {STATUS_OPTIONS.filter(s => s.key).map(s => (
                <button key={s.key} onClick={() => setStatus(s.key === status ? '' : s.key)}
                  className="px-3 py-1 text-xs rounded-full border-2 transition-colors"
                  style={{ backgroundColor: s.key === status ? 'var(--kq-accent)' : 'transparent', borderColor: s.key === status ? 'var(--kq-accent)' : 'var(--kq-border)', color: s.key === status ? '#fff' : 'var(--kq-text-dim)' }}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* 封面图片 */}
          <div>
            <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>封面图片</label>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={async () => { const p = await window.api.pickImage(); if (p) setCover(p) }}
                className="px-3 py-1.5 text-xs rounded border hover:opacity-80"
                style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>选择图片</button>
              <span className="text-xs truncate" style={{ color: 'var(--kq-text-dim)' }}>
                {cover ? (cover.length > 40 ? '…' + cover.slice(-38) : cover) : '未选择'}
              </span>
              {cover && (
                <button onClick={() => setCover('')}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] hover:opacity-70 shrink-0"
                  style={{ backgroundColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} title="清除封面">✕</button>
              )}
            </div>
          </div>

          {/* 数据来源 + 管理 */}
          <div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--kq-text-dim)' }}>数据来源</label>
              <button onClick={() => setShowManager(!showManager)}
                className="text-xs underline hover:opacity-70" style={{ color: 'var(--kq-text-dim)' }}>
                {showManager ? '关闭' : '管理'}
              </button>
            </div>
            <select value={source} onChange={e => setSource(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md text-sm border outline-none cursor-pointer"
              style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>
              <option value="bangumi">Bangumi</option>
              {customSources.map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* 来源管理面板 */}
          {showManager && (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
              <div className="text-xs font-medium" style={{ color: 'var(--kq-text-dim)' }}>管理数据来源</div>
              {/* 已有来源列表 */}
              {customSources.length > 0 && (
                <div className="space-y-1">
                  {customSources.map(s => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <span style={{ color: 'var(--kq-text-primary)' }}>{s.name}</span>
                      <span className="truncate" style={{ color: 'var(--kq-text-dim)' }}>{s.apiUrl || '（使用内置 API）'}</span>
                      <div className="flex-1" />
                      <button onClick={() => removeSource(s.name)}
                        className="text-xs hover:opacity-70" style={{ color: '#cc6666' }}>删除</button>
                    </div>
                  ))}
                </div>
              )}
              {/* 添加新来源 */}
              <div className="flex gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="来源名称"
                  className="flex-1 px-2 py-1 text-xs rounded border outline-none"
                  style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                  placeholder="API 地址（可选）"
                  className="flex-[2] px-2 py-1 text-xs rounded border outline-none"
                  style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }} />
                <button onClick={addSource}
                  className="px-2 py-1 text-xs rounded text-white shrink-0"
                  style={{ backgroundColor: 'var(--kq-accent)' }}>添加</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border"
            style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}>取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md text-white font-medium"
            style={{ backgroundColor: 'var(--kq-accent)' }}>保存</button>
        </div>
      </div>
    </Modal>
  )
}
