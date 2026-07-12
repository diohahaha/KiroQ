// ═══════════════════════════════════════════════════════════════
// shared/types.ts — 前后端共享类型契约
// 已核对旧版 config.py / data_manager.py / models.py 完整字段
// 架构：文件夹中心化（根目录 → 番剧文件夹 → 视频文件）
// ═══ 本版在原文件基础上追加【图片库】相关字段，原有内容全部保留 ═══
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

  // ── 图片库新增 ──
  imageViewerPath: string | null     // 图片/压缩包(zip/cbz) 查看器 exe 路径，未设置则退回系统默认打开方式
  ebookViewerPath: string | null     // 电子书(epub/txt) 阅读器 exe 路径，未设置则退回系统默认打开方式
  defaultLibraryMode: 'video' | 'image' // 启动时首页默认显示视频库还是图片库
  imageLibraryCardSize: number       // 图片库首页文件夹卡片宽度(px)，首页/详情页分开记
  imageDetailCardSize: number        // 图片库详情页文件宫格卡片宽度(px)
  videoLibraryCardSize: number       // 视频库首页番剧卡片宽度(px)，默认160，和之前写死的尺寸一致
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

  imageViewerPath: null,
  ebookViewerPath: null,
  defaultLibraryMode: 'video',
  imageLibraryCardSize: 160,
  imageDetailCardSize: 140,
  videoLibraryCardSize: 160,
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

// ── 图片库：压缩包 / 电子书扩展名 ──
export const ARCHIVE_EXTENSIONS = ['.zip', '.cbz'] as const
export const EBOOK_EXTENSIONS = ['.epub', '.txt', '.pdf'] as const

export type ImageResourceKind = 'image' | 'archive' | 'ebook' | 'video' | 'other'

/**
 * 判断图片库资源类型。以前遇到不认识的扩展名会返回 null、然后被扫描逻辑直接
 * 过滤掉不显示——现在改成"什么文件都要能看见"：图片/压缩包/电子书/视频归到
 * 各自的类型，其余一律归为 'other'，永远不返回 null。'other' 类型不生成封面
 * （前端用通用文件图标兜底），'video' 类型复用视频库现成的 ffmpeg 缩略图生成，
 * 不走图片库这套 zip/epub 解压逻辑。
 */
export function classifyImageResource(ext: string): ImageResourceKind {
  const e = ext.toLowerCase()
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(e)) return 'image'
  if ((ARCHIVE_EXTENSIONS as readonly string[]).includes(e)) return 'archive'
  if ((EBOOK_EXTENSIONS as readonly string[]).includes(e)) return 'ebook'
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(e)) return 'video'
  return 'other'
}

// ── 排序字段 ──
export type SortKey = 'name' | 'last_watched' | 'added_time'
export const SORT_OPTIONS: { label: string; key: SortKey }[] = [
  { label: '按文件夹名称', key: 'name' },
  { label: '按最后观看时间', key: 'last_watched' },
  { label: '按添加时间', key: 'added_time' },
]

// ── 图片库排序字段（没有"最后观看时间"，改成"最近打开"）──
export type ImageSortKey = 'name' | 'added_time'
export const IMAGE_SORT_OPTIONS: { label: string; key: ImageSortKey }[] = [
  { label: '按文件夹名称', key: 'name' },
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

// ── 过滤关键词（视频库专用默认词表）──
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

// ── 图片库扫描结果（files 混合图片/压缩包/电子书文件名） ──
export interface ImageScanResult {
  subdirs: string[]
  files: string[]
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
  /** 子菜单（目前仅图片库"标记标签"用到，一层嵌套即可，不支持多层） */
  submenu?: ContextMenuItem[]
}

// ═══════════════════════════════════════════════════════════════
// 图片库标签系统
// ═══════════════════════════════════════════════════════════════

/**
 * type='color'：卡片角标显示纯色圆点，label 仅用于设置里辨识/hover tooltip
 * type='text'：卡片角标显示文字小方块，color 是方块底色
 */
export interface ImageTagDef {
  id: string
  label: string
  type: 'color' | 'text'
  color: string // hex
}

export const DEFAULT_IMAGE_TAGS: ImageTagDef[] = [
  { id: 'tag_red',    label: '红标', type: 'color', color: '#aa3a3a' },
  { id: 'tag_blue',   label: '蓝标', type: 'color', color: '#3a6eaa' },
  { id: 'tag_green',  label: '绿标', type: 'color', color: '#3a7a3a' },
  { id: 'tag_yellow', label: '黄标', type: 'color', color: '#aa9a2a' },
]

// ═══════════════════════════════════════════════════════════════
// 图片库数据结构（独立于视频库 AppData，存独立 JSON 文件）
// ═══════════════════════════════════════════════════════════════

export interface ImageFolder {
  path: string
  name: string
  desc: string
  cover: string               // 封面缓存 hash（对应 kiroq://thumbnail/{hash}），空 = 无封面，前端书本图标兜底
  note: string
  tags: string[]               // 打在【文件夹】上的标签 id（独立于内部文件各自的标签）
  addedAt: number
  fileViewMode: 'list' | 'grid'
}

export interface ImageAppData {
  version: number
  root: string
  folderMeta: Record<string, ImageFolder>
  sortKey: ImageSortKey
  sortDesc: boolean
  addedTime: Record<string, number>
  pinned: string[]
  hidden: string[]

  folderWatched: string[]                  // 文件夹级"已看"标记（文件夹路径列表）

  fileTags: Record<string, string[]>       // filePath -> 标签 id 列表（文件级，独立于文件夹级标签）
  fileWatched: Record<string, string[]>    // folderPath -> 已看文件路径列表（结构对齐视频库 watched）
  lastOpened: Record<string, number>       // filePath -> 最近一次打开 epoch ms

  tagDefs: ImageTagDef[]

  autoFilterEmpty: boolean                 // 空文件夹自动隐藏
  filterKeywords: string                   // 自定义关键词过滤（默认词表为空，用户自己填）
  typeFilter: { image: boolean; archive: boolean; ebook: boolean; video: boolean; other: boolean }
}

export const DEFAULT_IMAGE_APP_DATA: ImageAppData = {
  version: 1,
  root: '',
  folderMeta: {},
  sortKey: 'name',
  sortDesc: false,
  addedTime: {},
  pinned: [],
  hidden: [],
  folderWatched: [],
  fileTags: {},
  fileWatched: {},
  lastOpened: {},
  tagDefs: DEFAULT_IMAGE_TAGS,
  autoFilterEmpty: true,
  filterKeywords: '',
  typeFilter: { image: true, archive: true, ebook: true, video: true, other: true },
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
  LIBRARY_COUNT_VIDEOS:   'library:countVideos',
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

  // ── 图片库 ──
  IMAGE_DATA_GET:                'imageData:get',
  IMAGE_DATA_SET_ROOT:           'imageData:setRoot',
  IMAGE_DATA_UPDATE_META:        'imageData:updateMeta',
  IMAGE_DATA_TOGGLE_PIN:         'imageData:togglePin',
  IMAGE_DATA_TOGGLE_HIDE:        'imageData:toggleHide',
  IMAGE_DATA_TOGGLE_ALL_PIN:     'imageData:toggleAllPin',
  IMAGE_DATA_TOGGLE_ALL_HIDE:    'imageData:toggleAllHide',
  IMAGE_DATA_BATCH_DELETE:       'imageData:batchDelete',
  IMAGE_DATA_SET_FOLDER_TAGS:    'imageData:setFolderTags',
  IMAGE_DATA_SET_FILE_TAGS:      'imageData:setFileTags',
  IMAGE_DATA_TOGGLE_FOLDER_WATCHED: 'imageData:toggleFolderWatched',
  IMAGE_DATA_TOGGLE_FILE_WATCHED:   'imageData:toggleFileWatched',
  IMAGE_DATA_SAVE_TAG_DEFS:      'imageData:saveTagDefs',
  IMAGE_DATA_SAVE_FILTER:        'imageData:saveFilter',
  IMAGE_LIBRARY_SCAN:            'imageLibrary:scan',
  IMAGE_LIBRARY_GET_COVER:       'imageLibrary:getCover',
  IMAGE_LIBRARY_OPEN_FILE:       'imageLibrary:openFile',
  IMAGE_LIBRARY_OPEN_ERROR_LOG:  'imageLibrary:openErrorLog',
  SETTINGS_PICK_IMAGE_VIEWER:    'settings:pickImageViewer',
  SETTINGS_PICK_EBOOK_VIEWER:    'settings:pickEbookViewer',
} as const
