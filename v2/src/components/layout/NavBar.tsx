/**
 * 导航栏：面包屑（首页=根目录，中间级可点击返回，末级=当前）
 */
import { useCallback, useRef, useEffect } from 'react'
import { Search, Settings, FolderOpen } from 'lucide-react'
import { useNavigationStore } from '@/state/navigationStore'
import { useUiStore } from '@/state/uiStore'
import { useLibraryStore } from '@/state/libraryStore'

interface NavBarProps {
  onPickRoot: () => void
  onOpenSettings: () => void
}

export function NavBar({ onPickRoot, onOpenSettings }: NavBarProps) {
  const stack = useNavigationStore(s => s.stack)
  const goHome = useNavigationStore(s => s.goHome)
  const goTo = useNavigationStore(s => s.goTo)
  const data = useLibraryStore(s => s.data)
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

  return (
    <div
      className="flex items-center px-3 h-[52px] border-b shrink-0 gap-2"
      style={{ backgroundColor: 'var(--kq-bg-nav)', borderColor: 'var(--kq-border)' }}
    >
      {/* 面包屑 */}
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {/* 首页按钮 → 始终回到根目录 */}
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
                  if (!isLast) goTo(entry)  // 非末级：回退到该级
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
            placeholder="🔍 搜索番剧…"
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
