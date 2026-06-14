import platform, os, sys, winreg

APP_NAME    = "KiroQ"
APP_VERSION = "1.0.0"
DATA_FILE   = os.path.join(os.path.expanduser("~"), ".kiroq_data.json")
DATA_VERSION = 3

VIDEO_EXTS = {".mp4",".mkv",".avi",".mov",".wmv",".flv",".m4v",".rmvb",".ts"}
IMAGE_EXTS = {".jpg",".jpeg",".png",".webp",".bmp"}

CARD_W, CARD_H   = 160, 270
COVER_W, COVER_H = 160, 200

# 视频宫格卡片尺寸
VIDEO_CARD_W, VIDEO_CARD_H   = 180, 200
VIDEO_THUMB_W, VIDEO_THUMB_H = 180, 120

# 字体跨平台检测
_SYS = platform.system()
if _SYS == "Windows":
    FONT_FAMILY = "Microsoft YaHei UI"
elif _SYS == "Darwin":
    FONT_FAMILY = "PingFang SC"
else:
    FONT_FAMILY = "Noto Sans CJK SC"


# ═══════════════════════════════════════════════════════════════
# 主题颜色系统 — 一个下拉框搞定一切
# ═══════════════════════════════════════════════════════════════

def _detect_system_mode() -> str:
    """检测 Windows 系统是深色还是亮色模式"""
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
        return "dark" if value == 0 else "light"
    except Exception:
        return "dark"

# ── 深色基础色 ──
DARK = {
    "bg_nav":        "#1a1a2e",  "bg_detail":     "#12121e",
    "bg_card":       "#1e1e2e",  "bg_toolbar":    "#111122",
    "border":        "#2a2a4a",  "border_pin":    "#ffaa00",
    "border_hover":  "#5555aa",  "text_main":     "#ccccdd",
    "text_dim":      "#666688",  "text_muted":    "#888888",
    "desc_bg":       "#151525",  "hover":         "#2a2a4e",
    "row_even":      "#1a1a2e",  "row_odd":       "#161624",
    "row_hover":     "#252540",  "cb_checked":    "#5555aa",
    "cb_unchecked":  "#333350",  "cb_hover":      "#444466",
    "watched_bg":    "#3a5a3a",  "watched_fg":    "#88cc88",
    "watched_text":  "#3a4a3a",  "unwatched_text":"#44445a",
    "canvas_bg":     "#1a1a2e",  "btn_toggle_a":  "#1e1e3e",
    "btn_toggle_b":  "#2a3a2a",  "sep_color":     "#2a2a4a",
    "toast_bg":      "#1e3a1e",  "hidden_card":   "#111118",
    "link_hover":    "#2a2a4e",  "crumb_sep":     "#555577",
    "crumb_last":    "#aaaacc",  "crumb_mid":     "#666688",
    "empty_text":    "#444466",
}

# ── 亮色基础色 ──
LIGHT = {
    "bg_nav":        "#e2e2ee",  "bg_detail":     "#f2f2f7",
    "bg_card":       "#ffffff",  "bg_toolbar":    "#eaeaf2",
    "border":        "#c8c8dd",  "border_pin":    "#cc8800",
    "border_hover":  "#7777cc",  "text_main":     "#333344",
    "text_dim":      "#7777aa",  "text_muted":    "#9999aa",
    "desc_bg":       "#eaeaF5",  "hover":         "#d8d8ee",
    "row_even":      "#f5f5fa",  "row_odd":       "#eeeef5",
    "row_hover":     "#ddddf0",  "cb_checked":    "#7777cc",
    "cb_unchecked":  "#ccccdd",  "cb_hover":      "#bbbbcc",
    "watched_bg":    "#c8e6c8",  "watched_fg":    "#448844",
    "watched_text":  "#448844",  "unwatched_text":"#9999aa",
    "canvas_bg":     "#e2e2ee",  "btn_toggle_a":  "#c8c8dd",
    "btn_toggle_b":  "#c8ddc8",  "sep_color":     "#c8c8dd",
    "toast_bg":      "#c8e6c8",  "hidden_card":   "#d8d8e0",
    "link_hover":    "#d8d8ee",  "crumb_sep":     "#9999bb",
    "crumb_last":    "#555577",  "crumb_mid":     "#8888aa",
    "empty_text":    "#aaaacc",
}

# ── 强调色 ──
ACCENT = {
    "blue":   {"accent": "#3a6eaa", "btn": "#1a3a5a", "btn_hover": "#2a4a6a", "name": "蓝"},
    "purple": {"accent": "#6a3aaa", "btn": "#2a1a4a", "btn_hover": "#3a2a5a", "name": "紫"},
    "green":  {"accent": "#3a7a3a", "btn": "#1a3a2a", "btn_hover": "#2a4a3a", "name": "绿"},
    "orange": {"accent": "#aa6a2a", "btn": "#3a2a1a", "btn_hover": "#5a3a2a", "name": "橙"},
    "red":    {"accent": "#aa3a3a", "btn": "#3a1a1a", "btn_hover": "#5a2a2a", "name": "红"},
    "teal":   {"accent": "#2a8a7a", "btn": "#1a3a32", "btn_hover": "#2a5a4a", "name": "青"},
    "pink":   {"accent": "#aa4a7a", "btn": "#3a1a2a", "btn_hover": "#5a2a3a", "name": "粉"},
}

# ── 主题预设（一个 key 决定全部）──
# key → (显示名, 模式, 强调色)
THEME_PRESETS = {
    "dark_blue":   ("🌙 深色 · 蓝", "dark", "blue"),
    "dark_purple": ("🌙 深色 · 紫", "dark", "purple"),
    "dark_green":  ("🌙 深色 · 绿", "dark", "green"),
    "dark_orange": ("🌙 深色 · 橙", "dark", "orange"),
    "dark_red":    ("🌙 深色 · 红", "dark", "red"),
    "dark_teal":   ("🌙 深色 · 青", "dark", "teal"),
    "dark_pink":   ("🌙 深色 · 粉", "dark", "pink"),
    "light_blue":   ("☀️ 亮色 · 蓝", "light", "blue"),
    "light_purple": ("☀️ 亮色 · 紫", "light", "purple"),
    "light_green":  ("☀️ 亮色 · 绿", "light", "green"),
    "light_orange": ("☀️ 亮色 · 橙", "light", "orange"),
    "light_red":    ("☀️ 亮色 · 红", "light", "red"),
    "light_teal":   ("☀️ 亮色 · 青", "light", "teal"),
    "light_pink":   ("☀️ 亮色 · 粉", "light", "pink"),
    "system":       ("🖥️ 跟随系统", "system", "blue"),
}
THEME_PRESET_LABELS = [v[0] for v in THEME_PRESETS.values()]
THEME_PRESET_KEYS   = list(THEME_PRESETS.keys())


def _blend(hex1: str, hex2: str, ratio: float = 0.5) -> str:
    """混合两个 hex 颜色，ratio=0 纯 hex1，ratio=1 纯 hex2"""
    r1, g1, b1 = int(hex1[1:3], 16), int(hex1[3:5], 16), int(hex1[5:7], 16)
    r2, g2, b2 = int(hex2[1:3], 16), int(hex2[3:5], 16), int(hex2[5:7], 16)
    r, g, b = int(r1 + (r2 - r1) * ratio), int(g1 + (g2 - g1) * ratio), int(b1 + (b2 - b1) * ratio)
    return f"#{r:02x}{g:02x}{b:02x}"


def _build_colors(preset_key: str) -> dict:
    """根据预设 key 构建完整颜色字典"""
    label, mode, accent_key = THEME_PRESETS.get(preset_key, THEME_PRESETS["dark_blue"])
    if mode == "system":
        mode = _detect_system_mode()
    base = dict(DARK if mode == "dark" else LIGHT)  # 复制一份
    a = ACCENT.get(accent_key, ACCENT["blue"])

    # ═══════════════════════════════════════════════════════
    # 把强调色全方位注入到界面中
    # ═══════════════════════════════════════════════════════

    # ① 所有背景色染上强调色 → 切换色彩时整体氛围改变
    tint = 0.10 if mode == "dark" else 0.06
    for key in ("bg_nav", "bg_detail", "bg_card", "bg_toolbar", "desc_bg",
                "row_even", "row_odd", "canvas_bg", "hidden_card",
                "toast_bg", "sep_color"):
        base[key] = _blend(base[key], a["accent"], tint)

    # ② 交互元素直接用强调色
    base["border_hover"] = a["accent"]          # 卡片悬停边框
    base["cb_checked"]   = a["accent"]          # 复选框选中
    base["cb_hover"]     = _blend(a["accent"], base["bg_card"], 0.5)
    base["crumb_last"]   = a["accent"]          # 面包屑当前页
    base["link_hover"]   = _blend(a["accent"], base["bg_nav"], 0.5)
    base["btn_toggle_a"] = a["btn"]             # 视图切换按钮
    base["btn_toggle_b"] = a["btn_hover"]
    base["text_dim"]     = _blend(a["accent"], base["text_main"], 0.45)
    base["empty_text"]   = _blend(a["accent"], base["bg_detail"], 0.3)

    return {**base, **a, "_preset": preset_key, "_mode": mode, "_accent": accent_key}


# ── 全局缓存 ──
_current_theme_cache: dict | None = None


def apply_theme(preset_key: str):
    """切换主题：更新全局缓存 + customtkinter 外观"""
    global _current_theme_cache
    _current_theme_cache = _build_colors(preset_key)
    import customtkinter as ctk
    label, mode, _ = THEME_PRESETS.get(preset_key, THEME_PRESETS["dark_blue"])
    if mode == "system":
        mode = _detect_system_mode()
    ctk.set_appearance_mode(mode)


def tc() -> dict:
    """返回当前主题颜色字典（所有 UI 渲染时调用）"""
    global _current_theme_cache
    if _current_theme_cache is None:
        _current_theme_cache = _build_colors("dark_blue")
    return _current_theme_cache


# ── 旧版兼容别名 ──
COLOR_THEMES = {
    k: {"accent": v["accent"], "btn": v["btn"],
        "btn_hover": v["btn_hover"], "accent_name": v["name"]}
    for k, v in ACCENT.items()
}

COLOR_BG_NAV     = DARK["bg_nav"]
COLOR_BG_CARD    = DARK["bg_card"]
COLOR_BG_DETAIL  = DARK["bg_detail"]
COLOR_BG_TOOLBAR = DARK["bg_toolbar"]
COLOR_BORDER     = DARK["border"]
COLOR_BORDER_PIN = DARK["border_pin"]
COLOR_BORDER_HOV = DARK["border_hover"]
COLOR_TEXT_DIM   = DARK["text_dim"]
COLOR_TEXT_MUTED = DARK["text_muted"]
COLOR_TEXT_MAIN  = DARK["text_main"]


SCRAPE_SOURCES = [
    ("Bangumi",    "bangumi", True),
    ("AniList",    "anilist", False),
    ("豆瓣",       "douban",  False),
    ("MyAnimeList","mal",     False),
]

SORT_OPTIONS = [
    ("按文件夹名称",   "name"),
    ("按最后观看时间", "last_watched"),
    ("按添加时间",     "added_time"),
]

STATUS_OPTIONS = [
    ("📺 在看",  "watching"),
    ("🔖 想看",  "want"),
    ("✅ 已完结","done"),
    ("⏸ 搁置",  "paused"),
    ("— 无标签", ""),
]

STATUS_COLORS = {
    "watching": "#3a6eaa",
    "want":     "#3a7a3a",
    "done":     "#5a5a5a",
    "paused":   "#8a6a2a",
    "":         "",
}

# 自动过滤非番剧文件夹的关键词（内置默认，用户可在设置中追加）
DEFAULT_FILTER_KEYWORDS = [
    "fonts","font","subs","subtitles","subtitle","extras","extra",
    "bonus","scans","scan","cd1","cd2","cd3","nfo","artwork",
    "featurettes","behind the scenes","deleted scenes","interviews",
    "trailers","samples","sample","extras","bdmv","backup","certificate",
    "specials","special","ova","pv","cm","nc","menu","menu2","preview",
    "op","ed","opening","ending","creditless","preview","trailer",
]
