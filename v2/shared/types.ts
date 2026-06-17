// ═══════════════════════════════════════════════════════════════
// shared/types.ts — 前后端共享类型契约
// 已核对旧版 config.py / data_manager.py / models.py 完整字段
// 架构：文件夹中心化（根目录 → 番剧文件夹 → 视频文件）
// ═══════════════════════════════════════════════════════════════

// ── 番剧文件夹元数据 ──
export interface AnimeFolder {
  path: string              // 绝对路径（唯一标识）
  name: string              // 显示名称（用户可编辑，默认取清洗后的文件夹名）
  desc: string              // 简介（纯文本）
  cover: string             // 封面图片路径
  link: string              // 外部链接（Bangumi 等）
  note: string              // 备注
  rating: number | null     // 评分 0-10
  status: '' | 'watching' | 'want' | 'done' | 'paused'
  source: string            // 数据来源: 'bangumi' | 'anilist' | 'douban' | 'mal'
  bgmId: number | null      // Bangumi subject ID
  fetched: boolean          // 是否已自动抓取过
  videoViewMode: 'list' | 'grid'  // 详情页视频视图模式
  addedAt: number           // epoch ms（首次发现时间）
}

// ── 完整应用数据（对应旧版 JSON 结构）──
export interface AppData {
  version: number
  root: string                          // 库根目录（单根，后续可扩展为多根）
  watched: Record<string, string[]>     // { folder_path → [video_paths] }
  folderMeta: Record<string, AnimeFolder>
  sortKey: 'name' | 'last_watched' | 'added_time'
  sortDesc: boolean
  lastWatchedTime: Record<string, number>  // { folder_path → epoch_seconds }
  addedTime: Record<string, number>        // { folder_path → epoch_seconds }
  pinned: string[]                         // 置顶文件夹路径
  hidden: string[]                         // 隐藏文件夹路径
  videoDurations: Record<string, number>   // { video_path → seconds }
}

// ── 应用设置 ──
export interface AppSettings {
  libraryRoots: string[]             // 库根目录列表（支持多根，默认单根）
  playerPath: string | null          // 外部播放器路径
  themePreset: ThemePresetKey
  ffmpegPath: string | null          // 自定义 ffmpeg 路径
  showHidden: boolean                // 显示已隐藏的番剧
  autoFilter: boolean                // 自动过滤非番剧文件夹
  filterKeywords: string             // 自定义过滤关键词（逗号分隔）
  autoFetch: boolean                 // 自动从 Bangumi 抓取
  language: 'zh' | 'en'             // 界面语言
}

// ── 默认设置 ──
export const DEFAULT_SETTINGS: AppSettings = {
  libraryRoots: [],
  playerPath: null,
  themePreset: 'dark_blue',
  ffmpegPath: null,
  showHidden: false,
  autoFilter: true,
  filterKeywords: '',
  autoFetch: true,
  language: 'zh',
}

// ── 默认应用数据 ──
export const DEFAULT_APP_DATA: AppData = {
  version: 1,
  root: '',
  watched: {},
  folderMeta: {},
  sortKey: 'name',
  sortDesc: false,
  lastWatchedTime: {},
  addedTime: {},
  pinned: [],
  hidden: [],
  videoDurations: {},
}

// ── 强调色 ──
export const ACCENT_COLORS = [
  { key: 'blue',   label: '蓝', hex: '#3a6eaa' },
  { key: 'purple', label: '紫', hex: '#6a3aaa' },
  { key: 'green',  label: '绿', hex: '#3a7a3a' },
  { key: 'orange', label: '橙', hex: '#aa6a2a' },
  { key: 'red',    label: '红', hex: '#aa3a3a' },
  { key: 'teal',   label: '青', hex: '#2a8a7a' },
  { key: 'pink',   label: '粉', hex: '#aa4a7a' },
  { key: 'gray',   label: '灰', hex: '#6a6a7a' },
] as const

export type AccentColorKey = (typeof ACCENT_COLORS)[number]['key']

// ── 主题 ──
export type ThemePresetKey =
  | 'dark_blue' | 'dark_purple' | 'dark_green' | 'dark_orange'
  | 'dark_red' | 'dark_teal' | 'dark_pink' | 'dark_gray'
  | 'light_blue' | 'light_purple' | 'light_green' | 'light_orange'
  | 'light_red' | 'light_teal' | 'light_pink' | 'light_gray'
  | 'system'

// ── 视频扩展名 ──
export const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.rmvb', '.ts',
] as const

// ── 图片扩展名 ──
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] as const

// ── 排序字段 ──
export type SortKey = 'name' | 'last_watched' | 'added_time'
export const SORT_OPTIONS: { label: string; key: SortKey }[] = [
  { label: '按文件夹名称', key: 'name' },
  { label: '按最后观看时间', key: 'last_watched' },
  { label: '按添加时间', key: 'added_time' },
]

// ── 状态标签 ──
export type WatchStatus = '' | 'watching' | 'want' | 'done' | 'paused'
export const STATUS_OPTIONS: { emoji: string; label: string; key: WatchStatus }[] = [
  { emoji: '📺', label: '在看', key: 'watching' },
  { emoji: '🔖', label: '想看', key: 'want' },
  { emoji: '✅', label: '已完结', key: 'done' },
  { emoji: '⏸', label: '搁置', key: 'paused' },
  { emoji: '',  label: '无标签', key: '' },
]

export const STATUS_COLORS: Record<string, string> = {
  watching: '#3a6eaa',
  want: '#3a7a3a',
  done: '#5a5a5a',
  paused: '#8a6a2a',
  '': '',
}

// ── 过滤关键词 ──
export const DEFAULT_FILTER_KEYWORDS = [
  'fonts', 'font', 'subs', 'subtitles', 'subtitle', 'extras', 'extra',
  'bonus', 'scans', 'scan', 'cd1', 'cd2', 'cd3', 'nfo', 'artwork',
  'featurettes', 'behind the scenes', 'deleted scenes', 'interviews',
  'trailers', 'samples', 'sample', 'bdmv', 'backup', 'certificate',
  'specials', 'special', 'ova', 'pv', 'cm', 'nc', 'menu', 'menu2', 'preview',
  'op', 'ed', 'opening', 'ending', 'creditless', 'trailer',
]

// ── 扫描结果 ──
export interface ScanResult {
  subdirs: string[]
  videos: string[]
}

// ── 迁移结果 ──
export interface MigrationResult {
  migrated: number
  skipped: number
  total: number
  errors: string[]
}

// ── 右键菜单项 ──
export interface ContextMenuItem {
  id: string
  label: string
  type?: 'normal' | 'separator' | 'checkbox'
  checked?: boolean
  enabled?: boolean
}

// ═══════════════════════════════════════════════════════════════
// IPC 通道常量
// ═══════════════════════════════════════════════════════════════
export const IPC = {
  DATA_GET:               'data:get',
  DATA_SAVE_SETTINGS:     'data:saveSettings',
  DATA_SET_ROOT:          'data:setRoot',
  DATA_UPDATE_META:       'data:updateMeta',
  DATA_MARK_WATCHED:      'data:markWatched',
  DATA_CLEAR_WATCHED:     'data:clearWatched',
  DATA_TOGGLE_PIN:        'data:togglePin',
  DATA_TOGGLE_HIDE:       'data:toggleHide',
  DATA_TOGGLE_ALL_PIN:    'data:toggleAllPin',
  DATA_TOGGLE_ALL_HIDE:   'data:toggleAllHide',
  DATA_BATCH_CLEAR:       'data:batchClear',
  DATA_BATCH_STATUS:      'data:batchStatus',
  LIBRARY_SCAN:           'library:scan',
  LIBRARY_GET_DURATION:   'library:getDuration',
  LIBRARY_GET_THUMBNAIL:  'library:getThumbnail',
  SETTINGS_GET:           'settings:get',
  SETTINGS_PICK_FOLDER:   'settings:pickFolder',
  SETTINGS_PICK_PLAYER:   'settings:pickPlayer',
  SETTINGS_PICK_IMAGE:    'settings:pickImage',
  PLAYER_LAUNCH:          'player:launch',
  PLAYER_TITLE_CHANGED:   'player:titleChanged',
  WINDOW_CONTEXT_MENU:    'window:contextMenu',
  BANGUMI_SEARCH:         'bangumi:search',
  BANGUMI_GET_SUBJECT:    'bangumi:getSubject',
  BANGUMI_DOWNLOAD_COVER: 'bangumi:downloadCover',
  SHELL_OPEN_FOLDER:      'shell:openFolder',
  SHELL_DELETE_FILE:      'shell:deleteFile',
} as const
