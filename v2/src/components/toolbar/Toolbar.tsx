/**
 * 工具栏：搜索 + 排序 + 设置按钮
 */
import { Settings, Scan } from 'lucide-react'
import { SearchBox } from './SearchBox'
import { SortControl } from './SortControl'
import { useUiStore } from '@/state/uiStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useSettingsStore } from '@/state/settingsStore'

export function Toolbar() {
  const openModal = useUiStore(s => s.openModal)
  const scan = useLibraryStore(s => s.scan)
  const libraryRoots = useSettingsStore(s => s.libraryRoots)

  return (
    <div
      className="flex items-center justify-between px-4 h-11 border-b shrink-0"
      style={{
        backgroundColor: 'var(--kq-bg-toolbar)',
        borderColor: 'var(--kq-border)',
      }}
    >
      <SearchBox />

      <div className="flex items-center gap-3">
        <SortControl />

        <button
          onClick={() => scan(libraryRoots)}
          className="p-1.5 rounded-md border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--kq-border)' }}
          title="重新扫描库"
        >
          <Scan size={16} color="var(--kq-text-primary)" />
        </button>

        <button
          onClick={() => openModal('settings')}
          className="p-1.5 rounded-md border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--kq-border)' }}
          title="设置"
        >
          <Settings size={16} color="var(--kq-text-primary)" />
        </button>
      </div>
    </div>
  )
}
