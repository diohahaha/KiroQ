/**
 * 导航栏：面包屑（首页=根目录，中间级可点击返回，末级=当前）
 * ── 本版追加：视频/图片库切换按钮 ──
 */
import { useCallback, useRef, useEffect } from 'react'
import { Search, Settings, FolderOpen, Video, Image as ImageIcon } from 'lucide-react'
import { useNavigationStore } from '@/state/navigationStore'
import { useUiStore } from '@/state/uiStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useImageLibraryStore } from '@/state/imageLibraryStore'

interface NavBarProps {
  onPickRoot: () => void
  onOpenSettings: () => void
  /** 当前顶层库模式：视频 or 图片。由 App.tsx 持有并传下来。 */
  libraryMode: 'video' | 'image'
  onSwitchLibraryMode: (mode: 'video' | 'image') => void
}

export function NavBar({ onPickRoot, onOpenSettings, libraryMode, onSwitchLibraryMode }: NavBarProps) {
  const stack = useNavigationStore(s => s.stack)
  const goHome = useNavigationStore(s => s.goHome)
  const goTo = useNavigationStore(s => s.goTo)
  const data = useLibraryStore(s => s.data)
  const imageData = useImageLibraryStore(s => s.data)
  const searchQuery = useUiStore(s => s.searchQuery)
  const setSearchQuery = useUiStore(s => s.setSearchQuery)
  const setFilterQuery = useUiStore(s => s.setFilterQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFilterQuery(searchQuery)
  }, [searchQuery, setFilterQuery])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // 图片库还没设根目录时才需要在切换那一刻弹选择框；已经设过就直接切换。
  const handleSwitchToImage = useCallback(() => {
    onSwitchLibraryMode('image')
    if (!imageData.root) {
      window.api.pickFolder?.().then((picked: string | null) => {
        if (picked) useImageLibraryStore.getState().setRoot(picked)
      })
    }
  }, [imageData.root, onSwitchLibraryMode])

  // 只有在库首页（stack 长度为 1）才显示视频/图片切换按钮；
  // 进入某个文件夹详情页后，文件夹类型已经固定，不该再允许切换，切换按钮变灰不可点。
  const atLibraryRoot = stack.length <= 1

  return (
    <div
      className="flex items-center px-3 h-[52px] border-b shrink-0 gap-2"
      style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)' }}
    >
      {/* 视频/图片切换 */}
      <div className="flex items-center rounded-md overflow-hidden border shrink-0" style={{ borderColor: 'var(--kq-border)' }}>
        <button
          disabled={!atLibraryRoot}
          onClick={() => onSwitchLibraryMode('video')}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
          style={{
            backgroundColor: libraryMode === 'video' ? 'var(--kq-accent)' : 'var(--kq-bg-card)',
            color: libraryMode === 'video' ? '#fff' : 'var(--kq-text-primary)',
            opacity: atLibraryRoot ? 1 : 0.5,
            cursor: atLibraryRoot ? 'pointer' : 'default',
          }}
          title={atLibraryRoot ? '切换到视频库' : '进入文件夹后不能切换库'}
        >
          <Video size={13} /> 视频
        </button>
        <button
          disabled={!atLibraryRoot}
          onClick={handleSwitchToImage}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
          style={{
            backgroundColor: libraryMode === 'image' ? 'var(--kq-accent)' : 'var(--kq-bg-card)',
            color: libraryMode === 'image' ? '#fff' : 'var(--kq-text-primary)',
            opacity: atLibraryRoot ? 1 : 0.5,
            cursor: atLibraryRoot ? 'pointer' : 'default',
          }}
          title={atLibraryRoot ? '切换到图片库' : '进入文件夹后不能切换库'}
        >
          <ImageIcon size={13} /> 图片
        </button>
      </div>

      {/* 面包屑 */}
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        <button
          onClick={() => goHome()}
          className="px-2 py-1 text-xs rounded hover:opacity-80 shrink-0 font-medium"
          style={{ color: 'var(--kq-text-primary)' }}
        >
          ⌂ 首页
        </button>

        {stack.slice(1).map((entry, i) => {
          const isLast = i === stack.length - 2
          const short = entry.name.length > 16 ? entry.name.slice(0, 14) + '…' : entry.name
          return (
            <span key={entry.path} className="flex items-center gap-0.5 shrink-0">
              <span style={{ color: 'var(--kq-crumb-sep)' }} className="text-sm">›</span>
              <button
                onClick={() => {
                  if (!isLast) goTo(entry)
                }}
                className="px-2 py-1 text-xs rounded hover:opacity-80 max-w-[160px] truncate"
                style={{ color: isLast ? 'var(--kq-crumb-last)' : 'var(--kq-crumb-mid)', cursor: isLast ? 'default' : 'pointer' }}
              >
                {short}
              </button>
            </span>
          )
        })}
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border w-[180px]"
          style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)' }}
        >
          <Search size={14} color="var(--kq-text-dim)" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={libraryMode === 'video' ? '🔍 搜索番剧…' : '🔍 搜索图片…'}
            className="bg-transparent text-xs outline-none w-full"
            style={{ color: 'var(--kq-text-primary)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="text-xs hover:opacity-70 shrink-0" style={{ color: 'var(--kq-text-dim)' }}>✕</button>
          )}
        </div>

        <button onClick={onOpenSettings} className="p-1.5 rounded hover:opacity-80"
          style={{ color: 'var(--kq-text-primary)' }} title="设置">
          <Settings size={18} />
        </button>

        <button onClick={onPickRoot}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md text-white"
          style={{ backgroundColor: 'var(--kq-btn)' }}>
          <FolderOpen size={14} /> 根目录
        </button>
      </div>
    </div>
  )
}
