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
│   │   ├── library.ts        # 视频库数据 CRUD + 扫描 + 时长 + 缩略图 IPC
│   │   ├── settings.ts       # 文件夹选择器 + 播放器选择 + 设置读写
│   │   ├── player.ts         # 播放器启动 + PotPlayer 窗口标题监控
│   │   ├── bangumi.ts        # Bangumi API 搜索/详情/封面下载（electron.net.fetch）
│   │   └── imageLibrary.ts   # 图片库数据 CRUD + 扫描 + 封面 IPC
│   ├── services/
│   │   ├── store.ts          # 视频库数据：JSON 文件 + 500ms 防抖 + 内存缓存
│   │   ├── taskQueue.ts      # 并发限流队列（coverQueue + scanQueue），修卡死的核心
│   │   ├── scanner.ts        # 目录扫描：scanFolder() / isAnimeFolder() / countVideosRecursive()
│   │   ├── ffmpegLocator.ts  # 探测 ffmpeg/ffprobe 可执行文件路径
│   │   ├── ffprobe.ts        # ffprobe 获取视频时长/分辨率
│   │   ├── thumbnail.ts      # ffmpeg 截帧生成缩略图（userData/thumbnails/）
│   │   ├── potplayerWatcher.ts # PowerShell 轮询 PotPlayer 窗口标题
│   │   ├── migrateOldData.ts # 一次性迁移 ~/.kiroq_data.json → kiroq-data.json
│   │   ├── imageScanner.ts   # 图片库扫描：递归扫描图片/压缩包/电子书/视频/其他文件
│   │   ├── imageStore.ts     # 图片库数据：独立 JSON 文件 + 内存缓存
│   │   ├── imageCover.ts     # 封面提取：zip/cbz(yauzl流式) 首图解包 + 缩放 + 失败记忆缓存
│   │   ├── imageOpener.ts    # 图片/压缩包/电子书打开（外部查看器或系统默认）
│   │   ├── coverErrorLog.ts  # 封面提取失败日志 → %APPDATA%/KiroQ/kiroq-image-cover-errors.log
│   │   ├── pdfLocator.ts     # 探测 pdftoppm.exe 路径（bin/ 优先，再试系统 PATH）
│   │   └── pdfCover.ts       # PDF 封面：调用 pdftoppm 渲染第一页为图片
│   └── utils/debounce.ts     # 通用防抖函数
│
├── src/                      # Renderer process（React 前端）
│   ├── main.tsx              # React 入口
│   ├── App.tsx               # 顶层：NavBar + 页面路由 + 全局弹窗
│   ├── vite-env.d.ts         # Window.api 类型扩展
│   │
│   ├── state/                # Zustand 状态管理
│   │   ├── libraryStore.ts     # 番剧数据（AppData 结构）
│   │   ├── settingsStore.ts    # 设置 + 主题（buildColors 复刻旧版 _build_colors）
│   │   ├── navigationStore.ts  # 导航栈（面包屑路径）
│   │   ├── uiStore.ts          # 搜索词 + 弹窗状态 + 编辑目标
│   │   └── imageLibraryStore.ts # 图片库状态（ImageAppData 结构）
│   │
│   ├── pages/
│   │   ├── LibraryPage.tsx      # 视频库主页：统计栏 + 番剧宫格 + 根视频 + 多选
│   │   ├── DetailPage.tsx       # 视频详情页：封面头 + 视频列表/宫格 + 子文件夹 + 时长扫描
│   │   ├── ImageLibraryPage.tsx # 图片库主页：文件夹卡片/列表 + 筛选 + 封面进度
│   │   └── ImageDetailPage.tsx  # 图片详情页：文件卡片/列表 + 筛选 + 搜索 + 封面进度
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── NavBar.tsx        # 面包屑导航 + 搜索框 + 设置/根目录按钮
│   │   │   ├── TitleBar.tsx      # 顶部标题栏
│   │   │   └── PageTransition.tsx # 页面切换动画（Framer Motion）
│   │   ├── grid/
│   │   │   ├── AnimeGrid.tsx       # 番剧宫格：VirtualGrid + 文件夹+根视频合并连续滚动 + 缩放滑条
│   │   │   ├── AnimeCard.tsx       # 番剧卡片，接 size prop
│   │   │   ├── RootVideoCard.tsx   # 根目录视频卡片（宫格），尺寸对齐 AnimeCard
│   │   │   ├── RootVideoRow.tsx    # 根目录视频行（列表），尺寸对齐 AnimeCard
│   │   │   ├── ImageFolderCard.tsx # 图片文件夹卡片（宫格视图），接 size prop
│   │   │   ├── ImageFolderRow.tsx  # 图片文件夹行（列表视图）
│   │   │   ├── ImageFileCard.tsx   # 图片文件卡片（宫格视图），接 size prop
│   │   │   ├── ImageFileRow.tsx    # 图片文件行（列表视图）
│   │   │   ├── TagBadges.tsx       # 标签角标：纯色圆点 / 文字方块
│   │   │   ├── CoverLoadProgress.tsx # 封面生成进度条（虚拟滚动后已弃用）
│   │   │   ├── VirtualGrid.tsx     # 通用虚拟滚动宫格（react-window + 内置滚动记忆）
│   │   │   └── VirtualList.tsx     # 通用虚拟滚动列表（单列）
│   │   ├── detail/
│   │   │   ├── DetailHeader.tsx    # 详情头部信息
│   │   │   ├── DetailCover.tsx     # 封面大图
│   │   │   └── DescriptionBox.tsx  # 简介文本
│   │   ├── dialogs/
│   │   │   ├── SettingsDialog.tsx  # 设置：主题/根目录/播放器/过滤/重新抓取
│   │   │   ├── EditDialog.tsx      # 编辑番剧信息 + Bangumi 搜索
│   │   │   └── ConfirmDialog.tsx   # 通用确认弹窗
│   │   ├── common/
│   │   │   ├── Modal.tsx           # 弹窗底座（Radix Dialog + Framer Motion）
│   │   │   ├── ThemeSwitcher.tsx   # 主题色块选择器
│   │   │   ├── Thumbnail.tsx       # 缩略图组件（kiroq:// 协议）
│   │   │   ├── EmptyState.tsx      # 空状态占位
│   │   ├── SkeletonScreen.tsx  # 冷启动骨架屏（导航+工具+卡片宫格占位呼吸闪烁）
│   │   │   ├── FilterPopover.tsx   # 筛选面板：资源类型/已看状态/标签/空文件夹隐藏
│   │   │   └── ZoomSlider.tsx      # 卡片缩放滑条：右下角浮动，停操 1.5s 自动收起
│   │   └── toolbar/
│   │       ├── Toolbar.tsx       # 工具栏容器
│   │       ├── SearchBox.tsx     # 搜索输入框
│   │       └── SortControl.tsx   # 排序下拉 + 升降序
│   │
│   ├── hooks/
│   │   ├── useContextMenu.ts    # Electron 原生右键菜单
│   │   ├── useDebouncedValue.ts # 防抖 hook
│   │   ├── useIpc.ts            # IPC 调用封装
│   │   └── useScrollReveal.ts   # 滚动触发显示/自动隐藏（缩放滑条用）
│   │
│   ├── utils/
│   │   ├── path.ts            # np() 路径归一化 / joinPath / basename
│   │   ├── cleanName.ts       # cleanSearchKeyword 文件夹名清洗
│   │   ├── cleanImageName.ts  # 图片文件名清洗
│   │   ├── format.ts          # formatDuration / formatTime / formatFileSize
│   │   ├── colorBlend.ts      # blendHex 颜色混合
│   │   ├── imageContextMenu.ts # 图片库右键菜单"标记标签"子菜单逻辑
│   │   └── scrollMemory.ts    # 滚动位置记忆（Map 按路径存，退出文件夹回来恢复）
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

### 并发限流（taskQueue.ts）
- 两种队列：`coverQueue`（封面解压，并发 3）+ `scanQueue`（递归扫描，并发 6）
- 防止大批量 fs 操作同时拥塞主进程事件循环导致界面卡死/白屏
- 视频库的 `countVideosRecursive` 走 scanQueue，图片库封面提取走 coverQueue

### 图片库（独立于视频库）
- 数据文件：`%APPDATA%/KiroQ/kiroq-image-data.json`（ImageAppData 结构）
- 资源类型：`image`（图片）/ `archive`（zip, cbz）/ `ebook`（epub, txt）/ `video`（视频，复用 ffmpeg 缩略图）/ `other`（通用 📄 图标兜底）
- `classifyImageResource()` 永远返回具体类型，`other` 兜底，不会因为"不认识扩展名"就过滤掉文件
- 文件夹标签（folderMeta.tags）和文件标签（fileTags）各自独立
- 封面缓存：`kiroq://thumbnail/{hash}`，hash 取自 zip 内首个可解压图片的 MD5

### 封面提取失败记忆 + 手动重试
- `imageCover.ts` 维护内存 Map：文件路径 → { size, mtime, 失败时间 }
- 某文件解压失败后，只要大小+修改时间没变，后续请求直接返回"无封面"，不重复尝试
- 仅此次运行期间有效，重启清空（不做持久化）
- 已有封面的文件不进队列，直接返回（避免陪跑排队）
- 超过 300MB 的压缩包自动跳过，但可手动突破：
  - 详情页工具栏「⚡ 获取超大文件封面」按钮：扫描当前文件夹中超过上限且无封面的文件，逐个强制重试（有 ✕ 取消按钮）
  - 右键菜单「🔄 重新获取封面」：对单个文件/文件夹强制重试，无视上限和失败记忆
- 3GB 绝对硬上限（即使强制模式也无法突破）：防止超大文件撑爆 Node 进程内存

### 封面统一缩放（nativeImage）
- 所有封面统一缩放到长边 **600px**（用 Electron 内置 `nativeImage`，无需额外原生模块）
- 首页卡片最大 240px，详情页最大 220px，高分屏 ×2 = 480px 需求，600px 留余量
- 视频缩略图从 160×200 调到 460×600；PDF 渲染从 400 调到 600
- 设置弹窗「🗑 清空缩略图缓存」按钮一键重建所有封面

### 封面失败日志（coverErrorLog.ts）
- 写入 `%APPDATA%/KiroQ/kiroq-image-cover-errors.log`
- 记录：时间戳、文件路径、失败原因（打不开/无图片/全部候选失败/超大文件）
- 设置弹窗有「📋 打开封面失败日志」按钮，方便定位解不开的原因
- 支持图片扩展名：`.jpg .jpeg .png .webp .bmp .gif .jfif .avif .tif .tiff`

### 封面生成进度
- `CoverLoadProgress.tsx` 显示 "🖼️ 正在生成封面 12/50" 进度条
- 首页和详情页顶部都有，全部生成完自动消失

### 筛选面板（FilterPopover.tsx）
- 替代原来摊在工具栏外的一排筛选按钮
- 一个 "🔍 筛选" 按钮，点开弹出面板，包含：资源类型 / 已看状态 / 标签 / 空文件夹隐藏
- 有非默认筛选条件时按钮右上角显示小圆点提示

### 文件夹列表/宫格切换
- 图片库首页支持 "☰ 列表"（ImageFolderRow）和 "▦ 宫格"（ImageFolderCard）切换
- 详情页文件同理：ImageFileRow（列表）/ ImageFileCard（宫格）

### 压缩包封面提取（yauzl）
- zip/cbz 用 `yauzl` 流式读取，不再用 `adm-zip`（避免 2GB 限制 + 整包读内存的问题）
- 只读 central directory + 需要的图片条目，不会一次性加载整个文件
- epub 仍用 `adm-zip`（epub 几乎不可能超过 2GB，风险低）
- `firstImageFromZip` 改为 async 函数（yauzl 是事件驱动异步 API）

### PDF 封面（pdfCover.ts + pdftoppm.exe）
- PDF 归类到"电子书"筛选类型（和 epub/txt 共用）
- 调用 `pdftoppm.exe`（poppler 工具集）渲染第一页为 PNG → 走独立进程，不阻塞主线程
- `pdfLocator.ts` 探测 pdftoppm 路径：`bin/` 优先，找不到再试系统 PATH（和 ffmpeg 一样）
- `taskQueue.ts` 新增 `pdfQueue`，并发 3
- 默认 300MB 上限，超大 PDF 可通过「⚡ 获取超大文件封面」按钮或右键菜单手动突破
- `.pdf` 已加入 `EBOOK_EXTENSIONS`

### 虚拟滚动（VirtualGrid / VirtualList）
- 基于 `react-window` 的通用虚拟滚动组件，视频库/图片库共用
- 只渲染屏幕可见区域的卡片，滚出视野的 DOM 节点被卸载，封面图被浏览器回收
- 天然附带"封面按可见性加载"效果——不在视口的卡片连 DOM 都没有，不会发起封面请求
- `VirtualGrid` 内置滚动位置记忆（传 `scrollKey` 接入 `scrollMemory.ts`）
- 文件夹和文件/视频合并成一个连续虚拟列表，一根滚动条打通（不再是两块独立区域）
- 虚拟滚动区域内不再用 framer-motion 入场/离场动画（会与虚拟挂载/卸载逻辑冲突）

### 冷启动骨架屏（SkeletonScreen.tsx）
- 软件打开、数据还没从磁盘读完时显示呼吸闪烁的骨架占位（导航+工具栏+卡片宫格）
- `App.tsx` 等 `loadData`/`loadImageData` 都返回后才切换到真实内容

### 卡片缩放滑条（ZoomSlider.tsx）
- 滚轮滚动时右下角浮出可拖动的滑条，停止操作 1.5s 后自动收起（`useScrollReveal` hook）
- 视频库首页 + 图片库首页 + 图片库详情页 三处都有，各自独立记忆尺寸
- `AppSettings.videoLibraryCardSize` / `imageLibraryCardSize` / `imageDetailCardSize` 分别存
- 默认值：视频 160px，图片首页 160px，图片详情 140px
- 拖动时立即生效（React state），停止拖动 300ms 后才写入设置文件（避免频繁写盘）
- 只在宫格视图显示，列表视图不需要缩放
- 卡片宽高、封面区域、占位图标字号按设定值等比例缩放

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
| 界面卡死/白屏 | `electron/services/taskQueue.ts` → coverQueue/scanQueue 并发限制 |
| 视频库卡片全部消失 | `electron/services/taskQueue.ts` → 大批量 countVideosRecursive 占满事件循环 |
| 图片库封面出不来 | `electron/services/imageCover.ts` → 逐个候选重试 / 失败记忆 / 并发限流 |
| 图片库文件不显示 | `shared/types.ts` → classifyImageResource() 是否返回了具体类型 |
| 筛选按钮太多 | `src/components/common/FilterPopover.tsx` → 筛选面板收拢所有筛选项 |
| 设置弹窗 ✕ 跑掉 | `src/components/dialogs/SettingsDialog.tsx` → 固定头部+可滚动内容+固定底部 |
| 封面进度不更新 | `src/components/grid/CoverLoadProgress.tsx` → pending/loading/finished 状态流转 |

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

### Hooks 调用顺序/数量不一致 → React 崩溃白屏（致命）

场景：组件提前 `return`（比如数据为空先渲染空状态），但 `return` 后面还有 `useCallback`/`useMemo` 等 Hook。数据加载完后不再提前 return，Hook 数量变了，React 直接抛错崩溃。

修复：**所有 Hook 必须放在提前 return 之前**，保证每次渲染调用的 Hook 数量和顺序完全一致。

### 详情页子文件夹 list/grid 切换失效

场景：`ImageDetailPage.tsx` 子文件夹区域没有判断 `viewMode`，永远用宫格渲染，只有文件列表跟着切换。

修复：子文件夹也分 grid（ImageFolderCard）和 list（ImageFolderRow）两种渲染。

### 详情页多选选不中文件夹

场景：`ImageDetailPage.tsx` 子文件夹卡片没有接 `selectMode`/`isSelected`/`onSelectToggle`，多选模式下点子文件夹只会进去，选不中。

修复：给子文件夹卡片补上多选 prop 接线。

### 大批量同步 fs 操作不加并发限流会卡死主进程

场景：视频库首页对几十个文件夹同时递归统计视频数，或图片库批量解压 zip 封面。每个任务都是同步 IO，全部并发堆在主进程事件循环上，导致渲染进程完全阻塞 → 卡片消失/界面白屏。

修复：用 `taskQueue.ts` 维护并发上限（coverQueue=3，scanQueue=6），同一时间只跑 N 个，其余排队。原理和浏览器请求并发限制一样，只不过这里限制的是 Node 主进程的 IO 操作。

```
