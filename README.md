# KiroQ v2.1

本地视频图片管理工具。浏览番剧文件夹、标记已看集数、自动获取番剧信息。

## 技术栈

Electron + TypeScript + React + Zustand + Tailwind CSS + Framer Motion + react-window

## 快速开始

```bash
npm install        # 安装依赖
setup.bat          # 下载 ffmpeg
npm run dev        # 开发模式
npm run build      # 构建
npm run dist       # 打包安装包
```

## 功能

### 视频库
- 番剧文件夹宫格浏览，虚拟滚动 + 自适应列数
- 进入文件夹查看视频列表/宫格，标记已看/未看
- 右键菜单：置顶、隐藏、打开文件夹位置、删除、多选批量操作
- 外部播放器启动 + PotPlayer 播放进度自动记录
- 视频时长扫描（ffprobe）+ 缩略图生成（ffmpeg）
- 根目录散装视频支持，宫格/列表视图
- 卡片缩放滑条（110-240px），滚轮触发
- 主页滚动位置记忆

### 图片库
- 图片/压缩包(zip,cbz)/电子书(epub,pdf,txt)/视频/其他文件浏览
- 压缩包封面自动提取（yauzl 流式读取，支持超大文件）
- PDF 封面提取（pdftoppm 渲染第一页）
- epub 封面解析（EPUB2/EPUB3 标准）
- 文件夹/文件级标签系统（纯色圆点 + 文字方块）
- 筛选面板：资源类型 / 已看状态 / 标签 / 空文件夹隐藏
- 右键菜单：标记标签（子菜单勾选）、打开、重新获取封面、删除
- 超大文件手动获取封面 + 封面失败日志
- 列表/宫格切换 + 卡片缩放滑条

### 通用
- 视频库/图片库一键切换
- Bangumi 自动抓取番剧信息（搜索/详情/封面）
- 15 套主题（暗色/亮色 × 7 色 + 灰色 + 跟随系统）
- 冷启动骨架屏
- 封面统一缩放（600px）+ 缩略图缓存管理
- 并发限流队列（防止大批量 IO 卡死界面）
- 导航面包屑、搜索、排序、短名/原名切换
- 窗口位置记忆

## 数据存储

- `%APPDATA%/KiroQ/kiroq-data.json` — 视频库观看记录、元数据
- `%APPDATA%/KiroQ/kiroq-image-data.json` — 图片库数据
- `%APPDATA%/KiroQ/window-state.json` — 窗口位置大小
- `%APPDATA%/KiroQ/thumbnails/` — 视频/图片缩略图缓存
- `%APPDATA%/KiroQ/kiroq-image-cover-errors.log` — 封面失败日志
- `%USERPROFILE%/.kiroq_data.json` — 旧版 v1.1 数据（自动迁移）

## 旧版

v1.1 (Python/customtkinter) 在 `v1/` 目录，只读保留。

## 免责声明

本软件按"原样"提供，不提供任何明示或暗示的担保。使用本软件即表示您同意：

- **数据风险**：数据存储在本地 JSON 文件，建议定期备份。开发者对任何数据丢失或损坏不承担责任。
- **外部服务**：数据抓取依赖第三方 API（如 Bangumi），可用性由服务提供方决定，与开发者无关。
- **版权声明**：本软件仅管理本地文件，不提供、不存储、不分发任何受版权保护的内容。用户对自己硬盘上的文件负责。
- **使用限制**：仅供个人学习和研究使用。

## 许可

MIT
