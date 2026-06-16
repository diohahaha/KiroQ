"""工具函数：图片、字体、Tooltip、Toast、确认框"""
import os, datetime, logging, functools, subprocess, threading, ctypes
from typing import Optional
from ctypes import wintypes
from PIL import Image, ImageDraw
import customtkinter as ctk
from config import IMAGE_EXTS, FONT_FAMILY, tc

log = logging.getLogger(__name__)

# ── 字体 ──────────────────────────────────────────────
def font(size: int = 12, weight: str = "normal") -> ctk.CTkFont:
    return ctk.CTkFont(family=FONT_FAMILY, size=size, weight=weight)

# ── 时间格式化 ────────────────────────────────────────
def fmt_time(ts: float) -> str:
    if not ts: return ""
    dt  = datetime.datetime.fromtimestamp(ts)
    now = datetime.datetime.now()
    if dt.date() == now.date():  return dt.strftime("今天 %H:%M")
    if (now - dt).days == 1:     return dt.strftime("昨天 %H:%M")
    if (now - dt).days < 7:      return dt.strftime("%a %H:%M")
    return dt.strftime("%m/%d")

# ── 封面图（按 key 清除的缓存）────────────────────────
_cover_cache: dict[tuple, Image.Image] = {}

def _cache_key(folder_path: str, custom: str, w: int, h: int) -> tuple:
    return (folder_path, custom, w, h)

def _placeholder_pil(w: int, h: int) -> Image.Image:
    img  = Image.new("RGB", (w, h), color=(30, 30, 45))
    draw = ImageDraw.Draw(img)
    cx, cy = w // 2, h // 2
    draw.rectangle([cx-22, cy-18, cx+22, cy+18], outline=(70,70,100), width=2)
    draw.polygon([(cx-10,cy-10),(cx-10,cy+10),(cx+14,cy)], fill=(70,70,100))
    return img

def _load_pil(folder_path: str, custom: str, w: int, h: int) -> Image.Image:
    if custom and os.path.isfile(custom):
        try:
            return Image.open(custom).convert("RGB").resize((w,h), Image.LANCZOS)
        except Exception as e:
            log.warning(f"load cover {custom}: {e}")
    try:
        files = os.listdir(folder_path)
    except Exception:
        return _placeholder_pil(w, h)
    for f in files:
        nl  = f.lower()
        ext = os.path.splitext(f)[1].lower()
        if ext in IMAGE_EXTS and any(k in nl for k in ("cover","poster","thumb","folder")):
            try:
                return Image.open(os.path.join(folder_path, f)).convert("RGB").resize((w,h), Image.LANCZOS)
            except Exception:
                pass
    for f in files:
        if os.path.splitext(f)[1].lower() in IMAGE_EXTS:
            try:
                return Image.open(os.path.join(folder_path, f)).convert("RGB").resize((w,h), Image.LANCZOS)
            except Exception:
                pass
    return _placeholder_pil(w, h)

def get_cover_ctk(folder_path: str, custom: str, w: int, h: int,
                   on_ready=None, root_widget=None) -> ctk.CTkImage:
    """获取封面 CTkImage。
    若缓存命中直接返回；否则先返回占位图，后台线程加载后通过 on_ready 回调刷新。
    """
    key = _cache_key(folder_path, custom, w, h)
    if key in _cover_cache:
        pil = _cover_cache[key]
        return ctk.CTkImage(light_image=pil, dark_image=pil, size=(w, h))

    # 缓存未命中：同步返回占位图，异步加载真实封面
    placeholder = _placeholder_pil(w, h)
    if on_ready and root_widget:
        def _bg():
            if len(_cover_cache) > 300:
                for k in list(_cover_cache.keys())[:150]:
                    del _cover_cache[k]
            pil2 = _load_pil(folder_path, custom, w, h)
            _cover_cache[key] = pil2
            ctk_img = ctk.CTkImage(light_image=pil2, dark_image=pil2, size=(w, h))
            try:
                root_widget.after(0, lambda: on_ready(ctk_img))
            except Exception:
                pass
        import threading
        threading.Thread(target=_bg, daemon=True).start()
    else:
        # 无回调时同步加载（兼容旧调用）
        if len(_cover_cache) > 300:
            for k in list(_cover_cache.keys())[:150]:
                del _cover_cache[k]
        _cover_cache[key] = _load_pil(folder_path, custom, w, h)
        pil = _cover_cache[key]
        return ctk.CTkImage(light_image=pil, dark_image=pil, size=(w, h))

    return ctk.CTkImage(light_image=placeholder, dark_image=placeholder, size=(w, h))

def invalidate_cover(folder_path: str):
    """只清除该文件夹相关的缓存条目"""
    to_del = [k for k in _cover_cache if k[0] == folder_path]
    for k in to_del:
        del _cover_cache[k]
    log.debug(f"invalidated {len(to_del)} cover cache entries for {folder_path}")

# ── 播放器 ────────────────────────────────────────────
def open_video(path: str, player_path: str = ""):
    import subprocess, platform
    if player_path and os.path.isfile(player_path):
        subprocess.Popen([player_path, path])
        return
    sys = platform.system()
    if sys == "Windows":   os.startfile(path)
    elif sys == "Darwin":  subprocess.call(["open", path])
    else:                  subprocess.call(["xdg-open", path])

def open_folder_explorer(path: str):
    import subprocess, platform
    sys = platform.system()
    if sys == "Windows":  subprocess.Popen(f'explorer "{path}"')
    elif sys == "Darwin": subprocess.call(["open", path])
    else:                 subprocess.call(["xdg-open", path])


# ── 视频时长提取 ──────────────────────────────────────
_ffprobe_lock = threading.Lock()

def _find_ffprobe() -> str | None:
    """探测 ffprobe，结果缓存（线程安全）"""
    if hasattr(_find_ffprobe, "_cached"):
        return _find_ffprobe._cached or None
    with _ffprobe_lock:
        # 双重检查：拿到锁后可能已被另一个线程填充
        if hasattr(_find_ffprobe, "_cached"):
            return _find_ffprobe._cached or None
        import subprocess
        for p in _FFPROBE_PATHS:
            try:
                r = subprocess.run([p, "-version"], capture_output=True, timeout=5)
                if r.returncode == 0:
                    _find_ffprobe._cached = p
                    log.info(f"ffprobe found: {p}")
                    return p
            except Exception:
                continue
        _find_ffprobe._cached = ""  # 标记已查找但未找到
        log.info("ffprobe not found — using 24min estimate")
        return None


def get_video_duration(filepath: str) -> float | None:
    """用内置 ffprobe 获取视频时长（秒），返回 None 则用 24min 估算"""
    import logging, subprocess, json
    log = logging.getLogger(__name__)
    exe = _find_ffprobe()
    if not exe:
        return None
    try:
        proc = subprocess.run(
            [exe, "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, timeout=15,
            encoding="utf-8", errors="replace")
        data = json.loads(proc.stdout)
        return float(data["format"]["duration"])
    except Exception as e:
        log.debug(f"duration probe failed: {e}")
    return None

# ── Tooltip（跟随鼠标）────────────────────────────────
class Tooltip:
    def __init__(self, widget, text: str):
        self.widget = widget
        self.text   = text
        self._win   = None
        self._job   = None
        widget.bind("<Enter>",       self._schedule, add="+")
        widget.bind("<Motion>",      self._move,     add="+")
        widget.bind("<Leave>",       self._cancel,   add="+")
        widget.bind("<ButtonPress>", self._cancel,   add="+")

    def _schedule(self, e=None):
        self._cancel()
        self._job = self.widget.after(500, lambda: self._show(e))

    def _move(self, e=None):
        if self._win and e:
            self._win.geometry(f"+{e.x_root+14}+{e.y_root+18}")

    def _cancel(self, e=None):
        if self._job:
            self.widget.after_cancel(self._job); self._job = None
        if self._win:
            self._win.destroy(); self._win = None

    def _show(self, e=None):
        if not self.text: return
        x = (e.x_root+14) if e else self.widget.winfo_rootx()+10
        y = (e.y_root+18) if e else self.widget.winfo_rooty()+30
        self._win = tw = ctk.CTkToplevel(self.widget)
        tw.overrideredirect(True)
        tw.attributes("-topmost", True)
        tw.geometry(f"+{x}+{y}")
        t = tc()
        ctk.CTkLabel(tw, text=self.text, font=font(12),
                     fg_color=t["row_hover"], corner_radius=6,
                     padx=10, pady=6).pack()

# ── 窗口图标 ────────────────────────────────────────
def set_window_icon(window):
    """给 CTkToplevel 设置应用图标（多次尝试确保生效）"""
    import sys as _sys
    try:
        if getattr(_sys, 'frozen', False):
            ico = os.path.join(_sys._MEIPASS, "anime_tracker", "kiroq.ico")
        else:
            ico = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kiroq.ico")
        if not os.path.exists(ico):
            return
        def _apply():
            try:
                if window.winfo_exists():
                    window.iconbitmap(ico)
            except Exception:
                pass
        # 多重保险：不同时间点尝试，确保 CTkToplevel 初始化完毕后图标能设上
        try: window.iconbitmap(ico)  # 立即可能失败但不碍事
        except Exception: pass
        window.after(20, _apply)
        window.after(120, _apply)
        window.after(400, _apply)
    except Exception:
        pass


# ── PopupMenu 基类 ────────────────────────────────────
class PopupMenu:
    """所有弹出菜单的基类，统一创建/定位/关闭逻辑"""
    _open_menu = None  # 同时只允许一个弹出菜单

    def __init__(self, parent, width: int, height: int,
                 anchor_widget=None, event=None):
        # 关闭之前打开的菜单
        if PopupMenu._open_menu:
            try:
                PopupMenu._open_menu.close()
            except Exception:
                pass
        PopupMenu._open_menu = self

        self._parent = parent
        self._menu = ctk.CTkToplevel(parent)
        set_window_icon(self._menu)  # 统一应用图标（Alt+Tab 可见）
        self._menu.overrideredirect(True)
        self._menu.transient(parent)  # 仅保持在父窗口之上，不遮挡其他软件
        if event:
            x, y = event.x_root, event.y_root
        elif anchor_widget:
            x = anchor_widget.winfo_rootx()
            y = anchor_widget.winfo_rooty() + anchor_widget.winfo_height() + 4
        else:
            x, y = 0, 0
        self._menu.geometry(f"{width}x{height}+{x}+{y}")
        t = tc()
        self.frame = ctk.CTkFrame(self._menu, corner_radius=8,
                                  border_width=1, border_color=t["border"],
                                  fg_color=t["bg_card"])
        self.frame.pack(fill="both", expand=True, padx=1, pady=1)
        self._menu.bind("<Escape>", lambda e: self.close())
        # 父窗口失焦时（切到其他软件）自动关闭弹窗
        self._focus_bind_id = parent.bind("<FocusOut>", lambda e: self.close(), add="+")
        # 延迟绑定父窗口点击关闭，避免打开菜单的那次点击立即触发关闭
        self._bind_id = None
        self._menu.after(200, self._activate_outside_click)

    def _activate_outside_click(self):
        """200ms 后激活：点击菜单外部任意位置关闭菜单"""
        try:
            if self._menu.winfo_exists():
                self._bind_id = self._parent.bind(
                    "<Button-1>", self._on_outside_click, add="+")
        except Exception:
            pass

    def _on_outside_click(self, event):
        """检测点击是否在菜单外部"""
        try:
            if not self._menu.winfo_exists():
                return
            mx = self._menu.winfo_rootx()
            my = self._menu.winfo_rooty()
            mw = self._menu.winfo_width()
            mh = self._menu.winfo_height()
            if not (mx <= event.x_root <= mx + mw and
                    my <= event.y_root <= my + mh):
                self.close()
        except Exception:
            pass

    def close(self):
        if PopupMenu._open_menu is self:
            PopupMenu._open_menu = None
        try:
            if self._bind_id is not None:
                self._parent.unbind("<Button-1>", self._bind_id)
                self._bind_id = None
        except Exception:
            pass
        try:
            if self._focus_bind_id is not None:
                self._parent.unbind("<FocusOut>", self._focus_bind_id)
                self._focus_bind_id = None
        except Exception:
            pass
        try:
            if self._menu.winfo_exists():
                self._menu.destroy()
        except Exception:
            pass

    def add_button(self, text: str, command, text_color: str = None,
                   hover_color: str = None):
        if text_color is None: text_color = tc()["text_main"]
        if hover_color is None: hover_color = tc()["hover"]
        from functools import partial
        btn = ctk.CTkButton(self.frame, text=text, height=30,
                            fg_color="transparent", hover_color=hover_color,
                            anchor="w", font=font(12), text_color=text_color,
                            command=command)
        btn.pack(fill="x", padx=4)
        return btn

    def add_label(self, text: str, color: str = None):
        if color is None: color = tc()["text_dim"]
        lbl = ctk.CTkLabel(self.frame, text=text, font=font(11),
                           text_color=color)
        lbl.pack(anchor="w", padx=10, pady=(6, 2))
        return lbl

    def add_separator(self):
        t = tc()
        ctk.CTkFrame(self.frame, height=1, fg_color=t["sep_color"]).pack(
            fill="x", padx=8, pady=2)

# ── Toast 通知 ────────────────────────────────────────
def show_toast(root_win, message: str, ms: int = 2200):
    try:
        toast = ctk.CTkToplevel(root_win)
        toast.overrideredirect(True)
        toast.attributes("-topmost", True)
        toast.attributes("-alpha", 0.92)
        t = tc()
        ctk.CTkLabel(toast, text=message, font=font(12),
                     fg_color=t["toast_bg"], corner_radius=8,
                     padx=16, pady=10).pack()
        root_win.update_idletasks()
        rw = root_win.winfo_width()
        rx = root_win.winfo_rootx()
        ry = root_win.winfo_rooty()
        rh = root_win.winfo_height()
        toast.update_idletasks()
        tw = toast.winfo_width()
        toast.geometry(f"+{rx+(rw-tw)//2}+{ry+rh-80}")
        toast.after(ms, toast.destroy)
    except Exception as e:
        log.warning(f"show_toast: {e}")

# ── 确认对话框 ────────────────────────────────────────
def confirm_dialog(parent, title: str, message: str) -> bool:
    result = [False]
    dlg = ctk.CTkToplevel(parent)
    dlg.title(title)
    dlg.resizable(False, False)
    dlg.grab_set(); dlg.lift(); dlg.focus_force()
    # 居中于父窗口
    parent.update_idletasks()
    px = parent.winfo_rootx() + (parent.winfo_width() - 340) // 2
    py = parent.winfo_rooty() + (parent.winfo_height() - 140) // 2
    dlg.geometry(f"340x140+{px}+{py}")
    set_window_icon(dlg)
    ctk.CTkLabel(dlg, text=message, font=font(13), wraplength=300).pack(pady=(24,16))
    row = ctk.CTkFrame(dlg, fg_color="transparent"); row.pack()
    def ok(): result[0]=True; dlg.destroy()
    ctk.CTkButton(row, text="确定", width=90, height=34,
                  fg_color="#3a1a1a", hover_color="#5a2a2a",  # 危险操作红色（语义色，不跟随主题）
                  font=font(12), command=ok).pack(side="left", padx=8)
    ctk.CTkButton(row, text="取消", width=90, height=34,
                  fg_color="transparent", font=font(12),
                  command=dlg.destroy).pack(side="left", padx=8)
    dlg.wait_window()
    return result[0]


# ── 文件夹名清洗（Bangumi 搜索前用）─────────────────────

# 噪声关键词：方括号内匹配到这些就丢弃
_NOISE_TOKENS = {
    "1080p","1080P","720p","720P","480p","480P","2160p","2160P","4K","4k","8K",
    "HEVC","AVC","H264","H265","x264","x265","AV1","H.264","H.265",
    "HEVC-10bit","HEVC 10bit","Hi10p","Hi10P","8bit","10bit",
    "FLAC","AAC","DDP","Atmos","TrueHD","DTS","DTS-HD","DTS-HDMA","MA","OPUS","PCM","AC3","EAC3",
    "MKV","MP4","AVI","RMVB","MOV","WMV","M2TS","TS",
    "BDRip","BDrip","BDRIP","BluRay","BLURAY","Blu-ray","WEB-DL","WEB DL",
    "WEBRip","WEB Rip","DVDRip","DVD","BD","Remux","REMUX",
    "TV","OVA","OAD","ONA","SP","MOVIE","TV+OVA","TV+OVA+SP","OVA+SP",
    "简繁内封","简繁","内封简繁","内封简繁中字","内封中字","内封",
    "简繁中字","简中","繁中","中字","外挂","外挂字幕",
    "中日双语","日文","中文","英文",
    "CHS","CHT","JPSC","GB","BIG5","SC","TC",
    "特典映像","映像特典","特典","SP特典","OVA特典",
    "NCED","NCOP","NCEDOP","NC","OP","ED","PV","CM","Menu",
    "Creditless","creditless","credit","Credit",
    "60fps","120fps","补帧","补幀",
    "全集","01-24TV全集","01-12TV全集","TV全集",
    "Repack","repack","Rerip","rerip","v2","v3","rev","Fix","fix",
    "Limited","LIMITED","Limited Edition",
}

_GROUP_PATTERNS = [
    r"DBD[-]?Raws", r"VCB[-]?(Studio|_S)?", r"LoliHouse", r"Snow[-]?Raws",
    r"Moozzi2", r"ReinForce", r"jsum", r"UCCUSS",
    r"mawen1250", r"LittleBakas", r"AI[-]?Raws",
    r"Philosophy[-]?raws", r"UHA[-]?WINGS", r"CASO",
    r"SumiSora", r"FLsnow", r"DMG", r"EMTP[-]?Raws",
    r"LowPower[-]?Raws", r"IrizaRaws", r"Koten_Gars",
    r"ank[-]?raws", r"SEED", r"天使羽翼", r"冷番补完",
    r"字幕组", r"压制组", r"个人压制", r"个人",
    r"Yousei[-]?Raws", r"Beatrice[-]?Raws", r"KawaiiRaws",
    r"Kamigami", r"Comicat", r"KissSub", r"HYSUB", r"KNA",
    r"Subsplease", r"Erai[-]?raws", r"HorribleSubs",
    r"Owlolf", r"NanDesuKa", r"EMBER", r"Judas",
    r"ASW", r"ToonsHub", r"Samaritan",
]


def _looks_like_noise(text: str) -> bool:
    """判断方括号内容是否为干扰信息（非标题）"""
    import re
    t = text.strip()
    if not t:
        return True
    if re.match(r'^\d{4}$', t):
        return True
    if re.match(r'^\d{4}[-~]\d{4}$', t):
        return True
    if re.match(r'^\d{3,4}[xX×]\d{3,4}$', t):
        return True
    if re.match(r'^\d+$', t):
        return True
    if t in _NOISE_TOKENS:
        return True
    if re.search(r'\d{1,3}[-~]\d{1,3}.*(?:全集|集|话|TV|OVA|特典|映像|SP|\+)', t):
        return True
    if re.search(r'(?:全集|特典映像|映像特典|特典映像)', t):
        return True
    for p in _GROUP_PATTERNS:
        if re.search(p, t, re.IGNORECASE):
            return True
    if re.match(r'^[A-Za-z0-9\-+_\.]{3,24}$', t):
        return True
    if re.search(r'(?:字幕|压制|编码|封装|补帧|修复|调轴|内[封嵌]|外挂)', t):
        return True
    # 空格/点号分隔的多词组合：如果超过一半是噪声词，整体判为噪声
    tokens = re.split(r'[\s\._]+', t)
    if len(tokens) >= 2:
        noise_count = sum(1 for tok in tokens if _is_noise_token(tok))
        if noise_count >= len(tokens) / 2:
            return True
    return False


def _is_noise_token(tok: str) -> bool:
    """判断单个 token 是否为噪声（分辨率、编码、格式等）"""
    import re
    t = tok.strip()
    if not t:
        return True
    if re.match(r'^\d+[pPkK]$', t): return True         # 1080p, 4K
    if re.match(r'^\d{3,4}[xX×]\d{3,4}$', t): return True  # 1920x1080
    if re.match(r'^\d+$', t): return True                # 纯数字
    if re.match(r'^[A-Za-z0-9\-+_\.]{2,10}$', t):       # 短字母数字：FLAC, x265, HEVC
        return t.lower() in {k.lower() for k in _NOISE_TOKENS if ' ' not in k and len(k) <= 10}
    return False


def clean_search_keyword(folder_name: str) -> str:
    """去掉文件夹名中的干扰信息，提高 Bangumi 搜索命中率

    支持两种常见命名格式：
      A) 年份前缀 + 多语言标题 + 媒体类型后缀
      B) 多段方括号 [压制组][标题][分辨率][编码][字幕]...
    """
    import re
    kw = folder_name.strip()

    # 先提取方括号内容（用原始名，不转换分隔符）
    brackets = re.findall(r'\[([^\]]+)\]', kw)
    title_from_brackets = [b for b in brackets if not _looks_like_noise(b)]

    # 方括号外内容：去掉方括号块，再清洗
    outside = re.sub(r'\[[^\]]+\]', ' ', kw)
    outside = outside.replace('_', ' ').replace('.', ' ')
    outside = re.sub(r'\([^)]*\)', ' ', outside)
    outside_noise = [
        r'\b\d{4}[-~]\d{4}\b', r'\b\d{4}\b',
        r'\b\d{3,4}[xX×]\d{3,4}\b',
        r'\b1080[pP]\b', r'\b720[pP]\b', r'\b2160[pP]\b', r'\b480[pP]\b',
        r'\bBDRip\b', r'\bBluRay\b', r'\bWEB-?DL\b', r'\bWEBRip\b', r'\bDVDRip\b',
        r'\bFLAC\b', r'\bAAC\b', r'\bHEVC\b', r'\bAVC\b',
        r'\bMKV\b', r'\bMP4\b', r'\bAVI\b', r'\bRMVB\b',
        r'\bx264\b', r'\bx265\b', r'\bAV1\b',
        r'\bBD\b', r'\bDVD\b', r'\bRemux\b',
        r'\bTV\b', r'\bOVA\b', r'\bMOVIE\b', r'\bSP\b', r'\bOAD\b', r'\bONA\b',
        r'\bHi10p\b', r'\b10bit\b', r'\b8bit\b',
    ]
    for pat in outside_noise:
        outside = re.sub(pat, ' ', outside, flags=re.IGNORECASE)

    # 二次过滤：逐 token 清除漏网噪声
    outside_tokens = outside.split()
    outside_tokens = [t for t in outside_tokens if not _is_noise_token(t)]
    outside = ' '.join(outside_tokens)

    parts = title_from_brackets + ([outside.strip()] if outside.strip() else [])
    result = ' '.join(parts)
    result = re.sub(r'\s+', ' ', result).strip()

    if not result:
        result = re.sub(r'\[[^\]]*\]', ' ', folder_name).replace('_',' ').replace('.',' ')
        result = re.sub(r'\([^)]*\)', ' ', result)
        result = re.sub(r'\s+', ' ', result).strip()
    return result if result else folder_name



# ── 视频缩略图（ffmpeg 截帧 + 磁盘缓存 + 异步懒加载）──────
# 设计目标：
#   1. 有 ffmpeg → 后台截帧，截好后刷新 UI（懒加载）
#   2. 没有 ffmpeg → 显示胶片占位图，不报错
#   3. 磁盘缓存 (.thumb_cache/) 避免重复提取，重启后复用
#   4. 内存 LRU 缓存（最多 400 条），超限后 FIFO 淘汰
#   5. 并发限制为 3，避免同时跑太多 ffmpeg 进程

import hashlib, collections

_THUMB_DIR   = os.path.join(os.path.expanduser("~"), ".anime_tracker_thumbs")
_thumb_mem: "collections.OrderedDict[tuple, Image.Image]" = collections.OrderedDict()
_THUMB_MEM_MAX = 400
_thumb_sem   = threading.Semaphore(3)   # 最多同时 3 个 ffmpeg 进程
_BIN_DIR = os.path.join(os.path.dirname(__file__), "bin")
_FFMPEG_PATHS = [
    os.path.join(_BIN_DIR, "ffmpeg.exe"),
    "ffmpeg",
    r"C:\ffmpeg\bin\ffmpeg.exe",
]
_FFPROBE_PATHS = [
    os.path.join(_BIN_DIR, "ffprobe.exe"),
    "ffprobe",
    r"C:\ffmpeg\bin\ffprobe.exe",
]
import sys as _sys
if getattr(_sys, 'frozen', False):
    _MEI_BIN = os.path.join(_sys._MEIPASS, "anime_tracker", "bin")
    _FFMPEG_PATHS.insert(0, os.path.join(_MEI_BIN, "ffmpeg.exe"))
    _FFPROBE_PATHS.insert(0, os.path.join(_MEI_BIN, "ffprobe.exe"))
_ffmpeg_exe: str | None = None   # 缓存探测结果（None=未探测，""=不可用）
_ffmpeg_checked = False


def _find_ffmpeg() -> str | None:
    """探测 ffmpeg 可执行路径，结果缓存在模块级变量"""
    global _ffmpeg_exe, _ffmpeg_checked
    if _ffmpeg_checked:
        return _ffmpeg_exe or None
    _ffmpeg_checked = True
    import subprocess
    for p in _FFMPEG_PATHS:
        try:
            r = subprocess.run([p, "-version"], capture_output=True, timeout=5)
            if r.returncode == 0:
                _ffmpeg_exe = p
                log.info(f"ffmpeg found: {p}")
                return p
        except Exception:
            continue
    _ffmpeg_exe = ""
    log.info("ffmpeg not found — thumbnails will use placeholder")
    return None


def _thumb_cache_path(video_path: str, w: int, h: int) -> str:
    """计算磁盘缓存文件路径"""
    os.makedirs(_THUMB_DIR, exist_ok=True)
    digest = hashlib.md5(f"{video_path}|{w}|{h}".encode()).hexdigest()
    return os.path.join(_THUMB_DIR, f"{digest}.jpg")


def _extract_thumb_ffmpeg(video_path: str, w: int, h: int) -> Image.Image | None:
    """用 ffmpeg 在第 5 秒截一帧，返回 PIL Image"""
    exe = _find_ffmpeg()
    if not exe:
        return None
    cache_file = _thumb_cache_path(video_path, w, h)
    # 磁盘缓存命中
    if os.path.isfile(cache_file):
        try:
            return Image.open(cache_file).convert("RGB").resize((w, h), Image.LANCZOS)
        except Exception:
            pass
    # 提取
    import subprocess, tempfile
    try:
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        cmd = [
            exe, "-y", "-ss", "5",
            "-i", video_path,
            "-vframes", "1",
            "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
            "-q:v", "3",
            tmp,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=20)
        if r.returncode == 0 and os.path.getsize(tmp) > 0:
            img = Image.open(tmp).convert("RGB").resize((w, h), Image.LANCZOS)
            # 写磁盘缓存
            try:
                img.save(cache_file, "JPEG", quality=80)
            except Exception:
                pass
            return img
    except Exception as e:
        log.debug(f"ffmpeg thumb failed [{os.path.basename(video_path)[:30]}]: {e}")
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass
    return None


def _mem_put(key: tuple, img: Image.Image):
    """放入内存 LRU，超限时淘汰最旧的"""
    if key in _thumb_mem:
        _thumb_mem.move_to_end(key)
    else:
        _thumb_mem[key] = img
        if len(_thumb_mem) > _THUMB_MEM_MAX:
            _thumb_mem.popitem(last=False)


def _video_placeholder_pil(w: int, h: int) -> Image.Image:
    """胶片占位图：深色底 + 齿孔 + 播放三角"""
    img  = Image.new("RGB", (w, h), color=(22, 22, 38))
    draw = ImageDraw.Draw(img)
    cx, cy  = w // 2, h // 2
    hole_h, hole_w = 6, 4
    for y_pos in range(hole_h, h - hole_h, max(h // 8, 8)):
        draw.rectangle([4, y_pos, 4 + hole_w, y_pos + hole_h], fill=(50, 50, 70))
        draw.rectangle([w - 4 - hole_w, y_pos, w - 4, y_pos + hole_h], fill=(50, 50, 70))
    r = min(w, h) // 5
    draw.polygon(
        [(cx - r, cy - r), (cx - r, cy + r), (cx + r + 2, cy)],
        fill=(90, 90, 130))
    return img


def get_video_thumb_ctk(video_path: str, w: int, h: int,
                         on_ready=None, root_widget=None) -> ctk.CTkImage:
    """获取视频缩略图 CTkImage（主线程调用）

    流程：
      ① 内存缓存命中 → 直接返回
      ② 磁盘缓存命中 → 读图、存内存、返回
      ③ 以上都没有 → 返回占位图，启动后台线程提取；
         提取完成后通过 on_ready(ctk_img) 回调刷新 UI
    """
    key = (video_path, w, h)

    # ① 内存缓存
    if key in _thumb_mem:
        _thumb_mem.move_to_end(key)
        pil = _thumb_mem[key]
        return ctk.CTkImage(light_image=pil, dark_image=pil, size=(w, h))

    # ② 磁盘缓存
    cache_file = _thumb_cache_path(video_path, w, h)
    if os.path.isfile(cache_file):
        try:
            pil = Image.open(cache_file).convert("RGB").resize((w, h), Image.LANCZOS)
            _mem_put(key, pil)
            return ctk.CTkImage(light_image=pil, dark_image=pil, size=(w, h))
        except Exception:
            pass

    # ③ 异步提取
    placeholder = _video_placeholder_pil(w, h)
    if on_ready and root_widget:
        def _bg():
            with _thumb_sem:
                pil2 = _extract_thumb_ffmpeg(video_path, w, h)
            if pil2 is None:
                return
            _mem_put(key, pil2)
            ctk_img = ctk.CTkImage(light_image=pil2, dark_image=pil2, size=(w, h))
            try:
                root_widget.after(0, lambda: on_ready(ctk_img))
            except Exception:
                pass
        threading.Thread(target=_bg, daemon=True).start()

    return ctk.CTkImage(light_image=placeholder, dark_image=placeholder, size=(w, h))


def invalidate_video_thumb(video_path: str):
    """清除某个视频的缩略图缓存（内存 + 磁盘）"""
    to_del = [k for k in _thumb_mem if k[0] == video_path]
    for k in to_del:
        del _thumb_mem[k]
    # 磁盘缓存：遍历可能的 w/h 组合（通常就一两种）
    for w, h in [(180, 120), (160, 120), (240, 135), (320, 180)]:
        f = _thumb_cache_path(video_path, w, h)
        try:
            if os.path.isfile(f):
                os.unlink(f)
        except Exception:
            pass
