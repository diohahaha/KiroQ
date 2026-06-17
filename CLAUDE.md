# KiroQ 项目结构

本地动漫观看进度管理工具，Python + customtkinter 桌面应用。

## 架构

```
anime_tracker/
├── main.py                 # 入口：App 类、导航路由、主页、设置回调
├── config.py               # 常量、主题颜色系统（THEME_PRESETS→tc()）
├── utils.py                # 字体、封面图、视频缩略图(ffmpeg)、时长(ffprobe)、PopupMenu、Toast、窗口图标
├── dialogs.py              # 编辑元数据、Bangumi 搜索、设置弹窗
├── bangumi.py              # Bangumi API 搜索/抓取（bgm.tv）
├── kiroq.ico / 1.png      # 应用图标
├── bin/                    # ffmpeg + ffprobe（build.bat 自动下载，不提交 git）
├── core/
│   ├── data_manager.py     # DataManager 类：数据读写、防抖保存、迁移
│   ├── models.py           # FolderMeta 数据类
│   └── state.py            # NavState 导航栈
└── ui/
    ├── nav.py              # NavBar 导航栏 + 面包屑
    ├── grid.py             # AnimeGrid 自适应宫格 + AnimeCard 卡片（支持多选模式）
    ├── detail.py           # DetailPage 详情页（头图+简介+视频列表+选择操作栏）
    ├── video_list.py       # VideoList 视频列表（行复用 + 多选指示器）
    ├── video_grid.py       # VideoGrid 视频宫格（多选支持）
    ├── menus.py            # SortMenu、CardContextMenu（单卡/批量）、MoreMenu、VideoContextMenu
    └── smooth_scroll.py    # SmoothScrollFrame Canvas 滚动容器
```

## 关键概念

### 主题系统
- `config.py` → `THEME_PRESETS` 定义 15 个主题 key（dark_blue, light_purple...）
- `tc()` 返回当前主题颜色字典（37 个键：bg_nav, border, text_main, btn...）
- `apply_theme(preset_key)` 切换主题 + 更新 CTk 外观模式
- 所有 UI 组件渲染时调用 `tc()` 获取最新颜色

### 数据流
- 数据文件：`~/.kiroq_data.json`（旧版 `.anime_tracker_data.json` 自动迁移）
- `DataManager` 封装读写，500ms 防抖保存
- 目录结构：root → 番剧文件夹 → 视频文件
- 元数据（封面、评分、简介）存在 `folder_meta` 中

### 视频处理
- **缩略图**：`get_video_thumb_ctk()` → 内存 LRU → 磁盘 `~/.anime_tracker_thumbs/{md5}.jpg` → ffmpeg 截帧（异步，并发 3）
- **时长**：`get_video_duration()` → ffprobe JSON → 缓存到 `video_durations`
- **时长统计**：主页 `_calc_watch_time()` 遍历已看列表累加，后台 `_scan_durations_bg()` 补充扫描
- ffmpeg/ffprobe 路径：`_find_ffmpeg()` / `_find_ffprobe()` 探测 `bin/`、系统 PATH

### 多选系统
- **触发**：右键菜单 →「☑ 多选」进入选择模式
- **视频列表**：行前 ● 圆点变为 ☐/☑ 勾选框；`VideoList` 管理 `_selected_fps` 集合
- **视频宫格**：卡片左上角叠加勾选框；`VideoGrid` 管理选中状态
- **番剧宫格**：`AnimeCard.set_select_mode()` + `AnimeGrid._selected_paths` 集合
- **操作栏**：父页面（`DetailPage` / `App`）监听 `set_selection_callback(count)` 显示/更新底部操作栏
- **退出**：Esc / 完成按钮；`count=-1` 隐藏操作栏

### 关键模式
- `np()` = `os.path.normpath`，所有路径统一格式
- `scan_folder()` 一次 `os.scandir` 同时返回子目录+视频文件
- 列表全量重建（nav、grid、detail），数据持久化，不怕丢状态
- VideoList 行复用：首次创建缓存，后续 `refresh()` 只 `configure()` 更新颜色
- `set_window_icon()` 四次重试确保弹窗图标生效

### 窗口记忆
- 设置 `win_geometry` 字段（`WxH+X+Y` 格式），800ms 防抖保存
- 最小化时不保存；关闭时立即保存

## 打包

```bash
build.bat          # Windows 一键打包 → dist/KiroQ.exe（含 ffmpeg，约 220MB）
python main.py     # 源码运行
```
