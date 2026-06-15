# 🎬 KiroQ v1.1

本地动漫观看进度管理工具 — 番剧文件夹浏览、Bangumi 元数据抓取、观看进度追踪。

## 安装

### 方式一：下载 EXE（推荐，无需 Python）

从 [Releases](../../releases) 下载 `KiroQ.exe`，双击运行。数据保存在 `C:\Users\<用户名>\.kiroq_data.json`。

> Windows Defender 可能误报，点"更多信息 → 仍要运行"即可。

### 方式二：源码运行

```bash
git clone https://github.com/blame-dev/KiroQ.git
cd KiroQ
pip install -r requirements.txt
python anime_tracker/main.py
```

内置 ffmpeg/ffprobe，无需额外安装。

## 功能

- 📂 自动扫描本地动漫文件夹，宫格/列表双视图
- 🎬 视频缩略图（ffmpeg 截帧）+ 精确时长统计（ffprobe）
- 🔍 Bangumi 自动抓取元数据（名称、评分、简介、封面）
- ✅ 视频观看进度标记、累计观看时间统计
- ☑ 多选批量操作（视频标记、番剧置顶/隐藏/状态/清记录）
- 🎨 14 套主题（深色/亮色 × 7 种配色）
- 📌 置顶、隐藏、状态标签（在看/想看/已完结/搁置）
- 💾 窗口大小位置自动记忆

## 快捷键

| 键 | 功能 |
|----|------|
| Backspace | 返回上一级 |
| Ctrl+F | 聚焦搜索框 |
| F5 | 刷新 |
| Escape | 退出选择模式 / 清空搜索 |

## 数据文件

所有数据存储在本地：

- `C:\Users\<用户名>\.kiroq_data.json` — 观看记录、元数据、设置
- `C:\Users\<用户名>\.kiroq.log` — 运行日志
- `C:\Users\<用户名>\.anime_tracker_thumbs\` — 视频缩略图缓存

---

## 免责声明

本软件按"原样"提供，不提供任何明示或暗示的担保。使用本软件即表示您同意：

- **数据风险**：数据存储在本地 JSON 文件，建议定期备份。开发者对任何数据丢失或损坏不承担责任。
- **外部服务**：Bangumi 抓取功能依赖第三方 API，可用性由服务提供方决定，与开发者无关。
- **版权声明**：本软件仅管理本地文件，不提供、不存储、不分发任何受版权保护的内容。用户对自己硬盘上的文件负责。
- **使用限制**：仅供个人学习和研究使用。

## License

MIT — 详见 [LICENSE](LICENSE)
