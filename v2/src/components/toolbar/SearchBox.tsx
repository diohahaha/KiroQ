/**
 * 搜索框：即时显示 + 300ms 防抖触发过滤。
 * 已核对旧版：搜索无 debounce（即时 trace_add），新框架默认 300ms
 */
import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useUiStore } from '@/state/uiStore'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

export function SearchBox() {
  const searchQuery = useUiStore(s => s.searchQuery)
  const setSearchQuery = useUiStore(s => s.setSearchQuery)
  const setFilterQuery = useUiStore(s => s.setFilterQuery)
  const debouncedQuery = useDebouncedValue(searchQuery, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFilterQuery(debouncedQuery)
  }, [debouncedQuery, setFilterQuery])

  // Ctrl+F 聚焦搜索框
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-md border"
      style={{
        backgroundColor: 'var(--kq-bg-card)',
        borderColor: 'var(--kq-border)',
      }}
    >
      <Search size={14} color="var(--kq-text-dim)" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="搜索视频…"
        className="bg-transparent text-sm outline-none w-40 placeholder:text-[var(--kq-text-dim)]"
        style={{ color: 'var(--kq-text-primary)' }}
      />
      {searchQuery && (
        <button onClick={() => setSearchQuery('')} className="hover:opacity-70">
          <X size={14} color="var(--kq-text-dim)" />
        </button>
      )}
    </div>
  )
}
