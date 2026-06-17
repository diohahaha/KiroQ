# KiroQ 项目结构

本地动漫观看进度管理工具，Electron + TypeScript + React + Zustand。

## 架构

```
kiroq/
├── package.json              # 依赖 + 脚本（dev/build/dist）
├── electron.vite.config.ts   # electron-vite 构建配置
├── electron-builder.yml      # 打包配置（NSIS 安装包）
├── setup.bat                 # 下载 ffmpeg 二进制到 bin/
├── bin/                      # ffmpeg.exe + ffprobe.exe（setup.bat 下载，不提交 git）
├── build/icon.ico            # 应用图标
│
├── shared/types.ts           # 【核心】前后端共享类型 + IPC 通道常量
│
├── electron/                 # Main process（Node.js 后端）
│   ├── main.ts               # 入口：窗口创建、协议注册、IPC 装配、窗口状态记忆
│   ├── preload.ts            # contextBridge → window.api 暴露给 renderer
│   ├── ipc/
│   │   ├── library.ts        # 数据 CRUD + 扫描 + 时长 + 缩略图 IPC
│   │   ├── settings.ts       # 文件夹选择器 + 播放器选择 + 设置读写
│   │   ├── player.ts         # 播放器启动 + PotPlayer 窗口标题监控
│   │   └── bangumi.ts        # Bangumi API 搜索/详情/封面下载（electron.net.fetch）
│   ├── services/
│   │   ├── store.ts          # 数据读写：JSON 文件 + 500ms 防抖 + 内存缓存
│   │   ├── scanner.ts        # 目录扫描：scanFolder() / isAnimeFolder()
│   │   ├── ffmpegLocator.ts  # 探测 ffmpeg/ffprobe 可执行文件路径
│   │   ├── ffprobe.ts        # ffprobe 获取视频时长/分辨率
│   │   ├── thumbnail.ts      # ffmpeg 截帧生成缩略图（userData/thumbnails/）
│   │   ├── potplayerWatcher.ts # PowerShell 轮询 PotPlayer 窗口标题
│   │   └── migrateOldData.ts # 一次性迁移 ~/.kiroq_data.json → kiroq-data.json
│   └── utils/debounce.ts     # 通用防抖函数
│
├── src/                      # Renderer process（React 前端）
│   ├── main.tsx              # React 入口
│   ├── App.tsx               # 顶层：NavBar + 页面路由 + 全局弹窗
│   ├── vite-env.d.ts         # Window.api 类型扩展
│   │
│   ├── state/                # Zustand 状态管理
│   │   ├── libraryStore.ts   # 番剧数据（AppData 结构）
│   │   ├── settingsStore.ts  # 设置 + 主题（buildColors 复刻旧版 _build_colors）
│   │   ├── navigationStore.ts # 导航栈（面包屑路径）
│   │   └── uiStore.ts        # 搜索词 + 弹窗状态 + 编辑目标
│   │
│   ├── pages/
│   │   ├── LibraryPage.tsx   # 库主页：统计栏 + 番剧宫格 + 根视频 + 多选
│   │   └── DetailPage.tsx    # 详情页：封面头 + 视频列表/宫格 + 子文件夹 + 时长扫描
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── NavBar.tsx        # 面包屑导航 + 搜索框 + 设置/根目录按钮
│   │   │   ├── TitleBar.tsx      # 顶部标题栏
│   │   │   └── PageTransition.tsx # 页面切换动画（Framer Motion）
│   │   ├── grid/
│   │   │   ├── AnimeGrid.tsx     # 番剧宫格：CSS Grid auto-fill + AnimatePresence 补位
│   │   │   └── AnimeCard.tsx     # 番剧卡片：封面 + 进度条 + 状态标签 + 多选
│   │   ├── detail/
│   │   │   ├── DetailHeader.tsx  # 详情头部信息
│   │   │   ├── DetailCover.tsx   # 封面大图
│   │   │   └── DescriptionBox.tsx # 简介文本
│   │   ├── dialogs/
│   │   │   ├── SettingsDialog.tsx # 设置：主题/根目录/播放器/过滤/重新抓取
│   │   │   ├── EditDialog.tsx    # 编辑番剧信息 + Bangumi 搜索
│   │   │   └── ConfirmDialog.tsx  # 通用确认弹窗
│   │   ├── common/
│   │   │   ├── Modal.tsx         # 弹窗底座（Radix Dialog + Framer Motion）
│   │   │   ├── ThemeSwitcher.tsx # 主题色块选择器
│   │   │   ├── Thumbnail.tsx     # 缩略图组件（kiroq:// 协议）
│   │   │   └── EmptyState.tsx    # 空状态占位
│   │   └── toolbar/
│   │       ├── Toolbar.tsx       # 工具栏容器
│   │       ├── SearchBox.tsx     # 搜索输入框
│   │       └── SortControl.tsx   # 排序下拉 + 升降序
│   │
│   ├── hooks/
│   │   ├── useContextMenu.ts     # Electron 原生右键菜单
│   │   ├── useDebouncedValue.ts  # 防抖 hook
│   │   └── useIpc.ts            # IPC 调用封装
│   │
│   ├── utils/
│   │   ├── path.ts           # np() 路径归一化 / joinPath / basename
│   │   ├── cleanName.ts      # cleanSearchKeyword 文件夹名清洗
│   │   ├── format.ts         # formatDuration / formatTime / formatFileSize
│   │   └── colorBlend.ts     # blendHex 颜色混合
│   │
│   └── styles/
│       ├── global.css        # 全局样式 + 表单主题变量
│       ├── themes.css        # 默认 CSS 变量（被 JS 动态覆盖）
│       └── tailwind.css      # Tailwind 入口
```

## 关键概念

### 数据模型（shared/types.ts）
- `AppData`：完整数据 `{ root, watched, folderMeta, pinned, hidden, videoDurations, ... }`
- `AnimeFolder`：文件夹元数据 `{ name, desc, cover, rating, status, bgmId, fetched, ... }`
- 文件夹中心化：根目录 → 番剧文件夹 → 视频文件
- 所有路径用 `np()` 归一化（`\` 分隔符）

### 数据流
- 数据文件：`%APPDATA%/KiroQ/kiroq-data.json`
- `store.ts` 维护内存状态 + 500ms 防抖写入 JSON
- renderer 通过 `window.api.getData()` → IPC → `getData()` 获取
- 修改操作通过 IPC → store 函数 → 防抖保存

### 主题系统（settingsStore.ts）
- `buildColors(mode, accent)` 复刻旧版 `_build_colors()`
- 暗色背景混 18% 强调色，亮色混 12% → 切换 accent 氛围变化
- `setProperty(key, value, 'important')` 直接写入 `:root.style`
- 启动时模块级立即执行，不等 React 挂载
- 15 个 preset：dark/light × 7 色 + gray + system

### 缩略图
- `getThumbnail(videoPath, w, h)` → 返回 MD5 hash
- 渲染侧用 `kiroq://thumbnail/{hash}` 加载
- 首次触发 ffmpeg 后台截帧，下次访问直接读缓存
- 磁盘缓存：`userData/thumbnails/{hash}.jpg`

### 右键菜单
- Electron 原生 `Menu.buildFromTemplate().popup()`（零自定义代码）
- renderer 通过 `window.api.showContextMenu(items)` 触发

### 封面图
- `kiroq://cover/{绝对路径}` 协议加载（不走被拦截的 `file://`）

### Bangumi 抓取
- `electron.net.fetch()` 走 Chromium 代理（国内用户需系统代理）
- `cleanSearchKeyword()` 清洗文件夹名后搜索
- 设置弹窗「重新抓取全部」/「仅未抓取的」+ 进度 + 取消

### 窗口记忆
- `userData/window-state.json` 存位置/大小
- 800ms 防抖，启动恢复

### 自动过滤
- 合并内置 `DEFAULT_FILTER_KEYWORDS` + 用户自定义关键词
- 文件夹名精确匹配（小写）
- 空文件夹（无视频+无子文件夹）自动隐藏

### 视频时长
- 进入文件夹后后台逐个 `getDuration()` 探测（ffprobe）
- 统计栏显示累计观看时间 `⏱ Xh Ym`

## 常见问题定位

| 问题 | 文件 |
|------|------|
| 主题颜色不变 | `src/state/settingsStore.ts` → `buildColors()` / `applyTheme()` |
| Bangumi 搜索失败 | `electron/ipc/bangumi.ts` → `net.fetch` 是否走代理 |
| 缩略图不显示 | `electron/ipc/library.ts` → `getThumbnail` IPC + `electron/main.ts` → `kiroq://` 协议 |
| ffmpeg 找不到 | `electron/services/ffmpegLocator.ts` → 检查 bin/ 是否存在 |
| 导航首页回不去 | `src/state/navigationStore.ts` → `goHome()` + `np()` 路径归一化 |
| 宫格留白太多 | `src/components/grid/AnimeGrid.tsx` → `calcGap` + `useLayoutEffect([hasData])` |
| 宫格间距不变 | **踩坑记录**：`useLayoutEffect(()=>{}, [])` 空数据先渲染空状态(无ref)，effect读到null跳过，数据到后`[]`不重跑 → 必须依赖`[hasData]` |
| 自动过滤无效 | `src/pages/LibraryPage.tsx` → `filterKws` + `emptyFolders` |
| 进度条不显示 | `src/components/grid/AnimeCard.tsx` → `totalVideos > 0` 条件 |
| 短名/原名无效 | `src/utils/cleanName.ts` → `cleanDisplayName()` |
| 设置不保存 | `src/state/settingsStore.ts` → `localStorage` 读写 |
| 窗口不记忆位置 | `electron/main.ts` → `window-state.json` 读写 |
| 封面图裂 | `electron/main.ts` → `kiroq://cover/` 协议注册 |
| 多选不工作 | `src/pages/LibraryPage.tsx` → `selectMode` + 操作栏 |
| 视频多选框 | `src/pages/DetailPage.tsx` → `sel` Set + `selectMode` |

## 打包

```bash
npm run dev      # 开发模式（Vite HMR + Electron）
npm run build    # 仅构建
npm run dist     # electron-builder → release/KiroQ Setup.exe
setup.bat        # 下载 ffmpeg 到 bin/
```

## 踩坑记录

### useEffect / useLayoutEffect 依赖数组不能写死 `[]`

场景：组件先以空数据渲染空状态（无 ref），数据到后才渲染真实 DOM（有 ref）。如果 effect 依赖是 `[]`，只在首次挂载跑一次，那时候 ref 是 null，后续永远不会再初始化。

修复：把触发 DOM 出现的条件放进依赖数组，如 `[hasData]`。

### React inline style 和 JS 直接改 DOM 冲突

不要同时在 JSX 的 `style={{ gap: 12 }}` 里设初始值、又在 effect 里用 `el.style.gap = '20px'` 改。React 每次渲染会覆盖。

修复：用 CSS 变量 `style={{ gap: 'var(--kq-gap)' }}`，effect 只改 `el.style.setProperty('--kq-gap', ...)`，React 不会覆盖。

### Node.js `https.get` 不走系统代理 → Bangumi 超时

国内用户需要系统代理才能访问 `api.bgm.tv`，`https.get` 不读取系统代理设置。

修复：用 `electron.net.fetch()`，走 Chromium 网络栈，自动使用系统代理。

### CSS Grid 和 Framer Motion layout 不兼容

Framer Motion 的 `layout` 动画用 `position: absolute` 做过渡，CSS Grid 的格子定位会冲突。

修复：用 flexbox (`display: flex; flex-wrap: wrap`) 代替 CSS Grid。
```
