# KiroQ 项目结构

本地动漫观看进度管理工具，Python + customtkinter 桌面应用。

## 架构

```
anime_tracker/
├── main.py                 # 入口：App 类、导航路由、主页、设置回调
├── config.py               # 常量、主题颜色系统（DARK/LIGHT/ACCENT→tc()）
├── data.py                 # JSON 数据读写、文件扫描工具（独立模块）
├── utils.py                # 字体、封面图、视频时长、PopupMenu、Toast
├── dialogs.py              # 编辑元数据、Bangumi 搜索、设置弹窗
├── bangumi.py              # Bangumi API 搜索/抓取（bgm.tv）
├── kiroq.ico / 1.png      # 应用图标
├── core/
│   ├── data_manager.py     # DataManager 类：数据读写、防抖保存、迁移
│   ├── models.py           # FolderMeta 数据类
│   └── state.py            # NavState 导航栈
└── ui/
    ├── nav.py              # NavBar 导航栏 + 面包屑
    ├── grid.py             # AnimeGrid 自适应宫格 + AnimeCard 卡片
    ├── detail.py           # DetailPage 详情页（头图+简介+视频列表）
    ├── video_list.py       # VideoList 视频列表（行复用优化）
    ├── video_grid.py       # VideoGrid 视频宫格
    ├── menus.py            # SortMenu、CardContextMenu、MoreMenu、VideoContextMenu
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

### 关键模式
- `np()` = `os.path.normpath`，所有路径统一格式
- `scan_folder()` 一次 `os.scandir` 同时返回子目录+视频文件
- 列表全量重建（nav、grid、detail），数据持久化，不怕丢状态

## 打包

```bash
build.bat          # Windows 一键打包 → dist/KiroQ.exe
python main.py     # 源码运行
```
