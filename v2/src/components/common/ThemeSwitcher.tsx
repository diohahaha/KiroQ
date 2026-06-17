/**
 * 主题切换组件：强调色色块按钮组（非下拉）。
 * 15 个预设对应旧版 THEME_PRESETS
 */
import { useSettingsStore } from '@/state/settingsStore'
import type { ThemePresetKey } from '@shared/types'

const THEME_OPTIONS: { key: ThemePresetKey; label: string; mode: 'dark' | 'light'; color: string }[] = [
  { key: 'dark_blue',   label: '深蓝', mode: 'dark',  color: '#3a6eaa' },
  { key: 'dark_purple', label: '深紫', mode: 'dark', color: '#6a3aaa' },
  { key: 'dark_green',  label: '深绿', mode: 'dark',  color: '#3a7a3a' },
  { key: 'dark_orange', label: '深橙', mode: 'dark', color: '#aa6a2a' },
  { key: 'dark_red',    label: '深红', mode: 'dark',  color: '#aa3a3a' },
  { key: 'dark_teal',   label: '深青', mode: 'dark',  color: '#2a8a7a' },
  { key: 'dark_pink',   label: '深粉', mode: 'dark',  color: '#aa4a7a' },
  { key: 'dark_gray',   label: '深灰', mode: 'dark',  color: '#6a6a7a' },
  { key: 'light_blue',   label: '亮蓝', mode: 'light', color: '#3a6eaa' },
  { key: 'light_purple', label: '亮紫', mode: 'light', color: '#6a3aaa' },
  { key: 'light_green',  label: '亮绿', mode: 'light', color: '#3a7a3a' },
  { key: 'light_orange', label: '亮橙', mode: 'light', color: '#aa6a2a' },
  { key: 'light_red',    label: '亮红', mode: 'light', color: '#aa3a3a' },
  { key: 'light_teal',   label: '亮青', mode: 'light', color: '#2a8a7a' },
  { key: 'light_pink',   label: '亮粉', mode: 'light', color: '#aa4a7a' },
  { key: 'light_gray',   label: '亮灰', mode: 'light', color: '#6a6a7a' },
  { key: 'system',       label: '系统', mode: 'dark',  color: '#555588' },
]

export function ThemeSwitcher() {
  const themePreset = useSettingsStore(s => s.themePreset)
  const setThemePreset = useSettingsStore(s => s.setThemePreset)

  return (
    <div className="flex flex-wrap gap-1.5">
      {THEME_OPTIONS.map(opt => (
        <button
          key={opt.key}
          title={opt.label}
          onClick={() => setThemePreset(opt.key)}
          className="w-7 h-7 rounded-full border-2 transition-all duration-150 hover:scale-110"
          style={{
            backgroundColor: opt.color,
            borderColor:
              themePreset === opt.key
                ? 'var(--kq-text-primary)'
                : 'transparent',
            opacity: themePreset === opt.key ? 1 : 0.6,
            boxShadow:
              themePreset === opt.key
                ? `0 0 0 2px ${opt.color}44`
                : 'none',
          }}
        />
      ))}
    </div>
  )
}
