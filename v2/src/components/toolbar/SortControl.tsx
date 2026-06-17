/**
 * 排序控件：下拉选字段 + 降序开关。
 * 已核对旧版 SORT_OPTIONS → 新框架扩展为 6 个 SortField
 */
import { ArrowUpDown } from 'lucide-react'
import { useSettingsStore } from '@/state/settingsStore'
import type { SortField } from '@shared/types'

const SORT_LABELS: Record<SortField, string> = {
  title: '名称',
  addedAt: '添加时间',
  lastWatchedAt: '最后观看',
  watchCount: '观看次数',
  durationSec: '时长',
  fileSizeBytes: '文件大小',
}

export function SortControl() {
  const sortField = useSettingsStore(s => s.sortField)
  const sortDescending = useSettingsStore(s => s.sortDescending)
  const setSortField = useSettingsStore(s => s.setSortField)
  const setSortDescending = useSettingsStore(s => s.setSortDescending)

  return (
    <div className="flex items-center gap-2">
      <select
        value={sortField}
        onChange={e => setSortField(e.target.value as SortField)}
        className="px-2 py-1.5 rounded-md text-sm border outline-none cursor-pointer"
        style={{
          backgroundColor: 'var(--kq-bg-card)',
          borderColor: 'var(--kq-border)',
          color: 'var(--kq-text-primary)',
        }}
      >
        {(Object.entries(SORT_LABELS) as [SortField, string][]).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      <button
        onClick={() => setSortDescending(!sortDescending)}
        className="p-1.5 rounded-md border transition-colors hover:opacity-80"
        style={{
          backgroundColor: sortDescending ? 'var(--kq-btn)' : 'var(--kq-bg-card)',
          borderColor: 'var(--kq-border)',
        }}
        title={sortDescending ? '降序（点击切换升序）' : '升序（点击切换降序）'}
      >
        <ArrowUpDown size={14} color="var(--kq-text-primary)" />
      </button>
    </div>
  )
}
