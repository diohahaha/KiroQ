"""弹窗：编辑信息、Bangumi 搜索、设置"""
import threading, webbrowser, os, logging
import customtkinter as ctk
from tkinter import filedialog
from functools import partial

from config import (SCRAPE_SOURCES, STATUS_OPTIONS,
                    THEME_PRESETS, THEME_PRESET_LABELS, THEME_PRESET_KEYS, tc)
from core.models import FolderMeta
from utils import font, get_cover_ctk, invalidate_cover, show_toast, confirm_dialog, clean_search_keyword, set_window_icon
import bangumi as bgm

log = logging.getLogger(__name__)


# ── 编辑信息弹窗 ──────────────────────────────────────
class EditMetaDialog(ctk.CTkToplevel):
    def __init__(self, parent, folder_path: str, meta: FolderMeta, on_save):
        super().__init__(parent)
        self.title("编辑番剧信息")
        self.geometry("560x660")
        self.resizable(False, False)
        self.grab_set(); self.lift(); self.focus_force()
        set_window_icon(self)
        self._folder  = folder_path
        self._meta    = FolderMeta.from_dict(meta.to_dict())  # 副本
        self._on_save = on_save
        self._cover   = meta.cover
        self._build()

    def _build(self):
        pad = {"padx": 24, "pady": (0, 12)}
        ctk.CTkLabel(self, text="编辑番剧信息",
                     font=font(16,"bold")).pack(padx=24, pady=(20,16), anchor="w")

        # Bangumi 一键抓取
        bar = ctk.CTkFrame(self, fg_color=tc()["bg_card"], corner_radius=8)
        bar.pack(fill="x", padx=24, pady=(0,16))
        ctk.CTkLabel(bar, text="自动从 Bangumi 抓取",
                     font=font(12), text_color=tc()["text_muted"]).pack(side="left", padx=12, pady=10)
        ctk.CTkButton(bar, text="🔍 搜索 Bangumi", width=140, height=32,
                      font=font(12),
                      command=self._open_bgm).pack(side="right", padx=10, pady=8)

        self._mk_field("显示名称",  "e_name",   self._meta.name,
                       os.path.basename(self._folder), pad)
        self._mk_field("外部链接",  "e_link",   self._meta.link,
                       "https://bgm.tv/subject/...", pad)
        self._mk_field("评分(0-10)","e_rating",
                       str(self._meta.rating or ""), "8.5", pad, width=120)
        self._mk_field("备注",      "e_note",   self._meta.note,
                       "随便写点什么…", pad)

        t_ = tc()
        ctk.CTkLabel(self, text="简介", font=font(12),
                     text_color=t_["text_muted"]).pack(anchor="w", padx=24)
        self.e_desc = ctk.CTkTextbox(self, width=512, height=80, font=font(12))
        self.e_desc.pack(**pad)
        if self._meta.desc: self.e_desc.insert("1.0", self._meta.desc)

        # 封面
        ctk.CTkLabel(self, text="封面图片", font=font(12),
                     text_color=t_["text_muted"]).pack(anchor="w", padx=24)
        cr = ctk.CTkFrame(self, fg_color="transparent")
        cr.pack(fill="x", padx=24, pady=(0,12))
        self.lbl_cover = ctk.CTkLabel(cr, text=self._short(self._cover) or "未选择",
                                       font=font(11), text_color=t_["text_dim"],
                                       anchor="w", width=380)
        self.lbl_cover.pack(side="left")
        ctk.CTkButton(cr, text="选择图片", width=100, height=32,
                      font=font(12), command=self._pick_cover).pack(side="right")

        # 数据来源
        ctk.CTkLabel(self, text="数据来源", font=font(12),
                     text_color=t_["text_muted"]).pack(anchor="w", padx=24)
        self.source_var = ctk.StringVar(value=self._meta.source)
        sf = ctk.CTkFrame(self, fg_color="transparent")
        sf.pack(fill="x", padx=24, pady=(0,16))
        for label, key, enabled in SCRAPE_SOURCES:
            ctk.CTkRadioButton(sf,
                text=f"{label}  {'✓' if enabled else '（即将支持）'}",
                variable=self.source_var, value=key,
                state="normal" if enabled else "disabled",
                font=font(12),
                text_color=t_["text_main"] if enabled else t_["text_dim"]).pack(anchor="w", pady=2)

        br = ctk.CTkFrame(self, fg_color="transparent")
        br.pack(fill="x", padx=24, pady=(0,20))
        ctk.CTkButton(br, text="取消", width=100, height=36,
                      fg_color="#2a1a1a", hover_color="#3a2a2a",
                      font=font(12), command=self.destroy).pack(side="right", padx=(8,0))
        ctk.CTkButton(br, text="保存", width=100, height=36,
                      font=font(12), command=self._save).pack(side="right")

    def _mk_field(self, label, attr, value, placeholder, pad, width=512):
        ctk.CTkLabel(self, text=label, font=font(12),
                     text_color=tc()["text_muted"]).pack(anchor="w", padx=24)
        e = ctk.CTkEntry(self, width=width, height=36,
                         placeholder_text=placeholder, font=font(12))
        e.pack(**{**pad, "anchor":"w"})
        if value: e.insert(0, str(value))
        setattr(self, attr, e)

    def _short(self, p): return ("…"+p[-48:]) if p and len(p)>50 else (p or "")

    def _pick_cover(self):
        path = filedialog.askopenfilename(title="选择封面图片",
            filetypes=[("图片文件","*.jpg *.jpeg *.png *.webp *.bmp"),("所有文件","*.*")])
        if path:
            self._cover = path
            self.lbl_cover.configure(text=self._short(path))

    def _open_bgm(self):
        name = self.e_name.get().strip() or clean_search_keyword(os.path.basename(self._folder))
        BangumiSearchDialog(self, name, self._folder, self._apply_and_save)

    def _apply_and_save(self, data: dict, cover_path: str):
        """选择 Bangumi 结果后：填入表单并立即保存"""
        self._apply(data, cover_path)
        self._save()

    def _apply(self, data: dict, cover_path: str):
        if data.get("name_cn"):
            self.e_name.delete(0,"end"); self.e_name.insert(0, data["name_cn"])
        if data.get("link"):
            self.e_link.delete(0,"end"); self.e_link.insert(0, data["link"])
        if data.get("rating"):
            self.e_rating.delete(0,"end"); self.e_rating.insert(0, str(data["rating"]))
        if data.get("summary"):
            self.e_desc.delete("1.0","end"); self.e_desc.insert("1.0", data["summary"])
        if cover_path:
            self._cover = cover_path
            self.lbl_cover.configure(text=self._short(cover_path))

    def _save(self):
        self._meta.name   = self.e_name.get().strip()
        self._meta.desc   = self.e_desc.get("1.0","end").strip()
        self._meta.link   = self.e_link.get().strip()
        self._meta.note   = self.e_note.get().strip()
        self._meta.cover  = self._cover
        self._meta.source = self.source_var.get()
        try:    self._meta.rating = float(self.e_rating.get())
        except: self._meta.rating = None
        invalidate_cover(self._folder)
        self._on_save(self._meta)
        self.destroy()


# ── Bangumi 搜索弹窗 ──────────────────────────────────
class BangumiSearchDialog(ctk.CTkToplevel):
    def __init__(self, parent, keyword: str, folder_path: str, on_select):
        super().__init__(parent)
        self.title("从 Bangumi 搜索")
        self.geometry("580x520")
        self.resizable(False, False)
        self.grab_set(); self.lift(); self.focus_force()
        set_window_icon(self)
        self._folder    = folder_path
        self._on_select = on_select
        self._build(keyword)

    def _build(self, keyword):
        ctk.CTkLabel(self, text="搜索 Bangumi",
                     font=font(15,"bold")).pack(padx=20, pady=(16,10), anchor="w")
        row = ctk.CTkFrame(self, fg_color="transparent")
        row.pack(fill="x", padx=20, pady=(0,8))
        self.entry = ctk.CTkEntry(row, width=400, height=36,
                                   placeholder_text="输入番剧名…", font=font(13))
        self.entry.pack(side="left", padx=(0,8))
        self.entry.insert(0, keyword)
        self.btn = ctk.CTkButton(row, text="搜索", width=90, height=36,
                                  font=font(12), command=self._search)
        self.btn.pack(side="left")
        self.entry.bind("<Return>", lambda e: self._search())
        self.status = ctk.CTkLabel(self, text="", font=font(11), text_color=tc()["text_muted"])
        self.status.pack(anchor="w", padx=20)
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=20, pady=(4,16))
        self.after(100, self._search)

    def _search(self):
        kw = self.entry.get().strip()
        if not kw: return
        self.status.configure(text="搜索中…")
        self.btn.configure(state="disabled")
        for w in self.scroll.winfo_children(): w.destroy()
        def run():
            results = bgm.search(kw)
            self.after(0, partial(self._show, results))
        threading.Thread(target=run, daemon=True).start()

    def _show(self, results):
        self.btn.configure(state="normal")
        for w in self.scroll.winfo_children(): w.destroy()
        if not results:
            self.status.configure(text="没有找到结果，换个关键词试试"); return
        self.status.configure(text=f"找到 {len(results)} 个结果，点击选择")
        for item in results:
            t_ = tc()
            card = ctk.CTkFrame(self.scroll, corner_radius=8, fg_color=t_["bg_card"],
                                border_width=1, border_color=t_["border"])
            card.pack(fill="x", pady=4)
            info = ctk.CTkFrame(card, fg_color="transparent")
            info.pack(side="left", fill="both", expand=True, padx=12, pady=8)
            ctk.CTkLabel(info, text=item["name_cn"] or item["name"],
                         font=font(13,"bold"), anchor="w").pack(anchor="w")
            parts = []
            if item.get("air_date"): parts.append(item["air_date"])
            if item.get("eps"):      parts.append(f"{item['eps']}话")
            if item.get("rating"):   parts.append(f"⭐{item['rating']}")
            if parts:
                ctk.CTkLabel(info, text="  ·  ".join(parts),
                             font=font(11), text_color=t_["text_dim"], anchor="w").pack(anchor="w")
            if item.get("summary"):
                short = item["summary"][:80]+("…" if len(item["summary"])>80 else "")
                ctk.CTkLabel(info, text=short, font=font(11), text_color=t_["text_muted"],
                             anchor="w", wraplength=380, justify="left").pack(anchor="w")
            ctk.CTkButton(card, text="选择", width=70, height=32, font=font(12),
                          command=partial(self._select, item)).pack(side="right", padx=10, pady=10)

    def _select(self, item):
        self.status.configure(text="正在下载封面…")
        def run():
            full = bgm.get_subject(item["id"]) or item
            full["link"] = f"https://bgm.tv/subject/{item['id']}"
            cover_path   = bgm.download_cover(full.get("image",""), self._folder)
            self.after(0, partial(self._finish, full, cover_path or ""))
        threading.Thread(target=run, daemon=True).start()

    def _finish(self, data, cover_path):
        self._on_select(data, cover_path)
        self.destroy()


# ── 设置弹窗 ──────────────────────────────────────────
class SettingsDialog(ctk.CTkToplevel):
    def __init__(self, parent, settings: dict, on_save, on_refetch_all=None):
        super().__init__(parent)
        self.title("设置")
        self.geometry("500x480")
        self.resizable(False, False)
        self.grab_set(); self.lift(); self.focus_force()
        self.protocol("WM_DELETE_WINDOW", self._save_and_close)
        set_window_icon(self)
        self._s            = dict(settings)
        self._on_save      = on_save
        self._on_refetch   = on_refetch_all
        self._parent       = parent  # 主窗口引用，供即时预览用
        self._build()

    def _build(self):
        ctk.CTkLabel(self, text="设置",
                     font=font(16,"bold")).pack(padx=24, pady=(20,12), anchor="w")

        # ── 主题方案（即时生效，无需保存）──
        self._sec("主题方案")
        tr = ctk.CTkFrame(self, fg_color="transparent")
        tr.pack(fill="x", padx=24, pady=(0, 10))
        ctk.CTkLabel(tr, text="主题", font=font(12), width=80, anchor="w").pack(side="left")

        current_preset = self._s.get("theme_preset", "dark_blue")
        current_label = THEME_PRESETS.get(current_preset, THEME_PRESETS["dark_blue"])[0]
        self.v_theme_preset = ctk.StringVar(value=current_label)
        self._label_to_key = dict(zip(THEME_PRESET_LABELS, THEME_PRESET_KEYS))

        ctk.CTkOptionMenu(tr, values=THEME_PRESET_LABELS,
                          variable=self.v_theme_preset,
                          command=self._on_theme_changed,  # ← 即时预览
                          width=260, height=32, font=font(12),
                          anchor="w").pack(side="left")

        # 显示
        self._sec("显示")
        self._switch("显示已隐藏的番剧", "show_hidden")
        self._switch("自动过滤非番剧文件夹（字体/字幕/特典等）", "auto_filter")

        # 自定义过滤关键词
        filter_row = ctk.CTkFrame(self, fg_color="transparent")
        filter_row.pack(fill="x", padx=24, pady=(0, 6))
        ctk.CTkLabel(filter_row, text="过滤关键词\n（逗号分隔，追加到内置列表）",
                     font=font(11), text_color=tc()["text_dim"], anchor="w", width=130).pack(side="left")
        self.e_filter = ctk.CTkEntry(filter_row, width=320, height=32, font=font(12),
                                      placeholder_text="例如: ova, spec, cm, creditless")
        self.e_filter.pack(side="left", padx=(8, 0))
        if self._s.get("filter_keywords"):
            self.e_filter.insert(0, self._s["filter_keywords"])

        # 抓取
        self._sec("Bangumi 抓取")
        self._switch("进入新文件夹时自动抓取", "auto_fetch")
        btn_row = ctk.CTkFrame(self, fg_color="transparent"); btn_row.pack(fill="x", padx=24, pady=(4,8))
        ctk.CTkButton(btn_row, text="🔄 重新抓取全部番剧", width=200, height=34,
                      fg_color="#1a2a3a", hover_color="#2a3a5a",
                      font=font(12), command=self._refetch_all).pack(side="left")

        # 播放器
        self._sec("播放器")
        pl = ctk.CTkFrame(self, fg_color="transparent"); pl.pack(fill="x", padx=24, pady=(0,12))
        self.e_player = ctk.CTkEntry(pl, width=360, height=34, font=font(12),
                                      placeholder_text="留空则用系统默认播放器")
        self.e_player.pack(side="left", padx=(0,8))
        if self._s.get("player_path"): self.e_player.insert(0, self._s["player_path"])
        ctk.CTkButton(pl, text="浏览", width=70, height=34,
                      font=font(12), command=self._pick_player).pack(side="left")

        # ffmpeg（视频缩略图）
        self._sec("视频缩略图（ffmpeg）")
        ff_info = ctk.CTkFrame(self, fg_color="transparent")
        ff_info.pack(fill="x", padx=24, pady=(0, 6))

        # 探测当前状态
        from utils import _find_ffmpeg
        ff_path = _find_ffmpeg()
        if ff_path:
            status_text  = f"✅ 已就绪：{ff_path}"
            status_color = tc()["watched_fg"]
        else:
            status_text  = "❌ 未检测到 ffmpeg，视频宫格将显示占位图"
            status_color = tc()["text_muted"]

        self._lbl_ffmpeg = ctk.CTkLabel(ff_info, text=status_text, font=font(11),
                                         text_color=status_color, anchor="w", wraplength=440)
        self._lbl_ffmpeg.pack(anchor="w")

        ff_btn_row = ctk.CTkFrame(self, fg_color="transparent")
        ff_btn_row.pack(fill="x", padx=24, pady=(0, 10))

        # 手动指定路径
        self.e_ffmpeg = ctk.CTkEntry(ff_btn_row, width=270, height=32, font=font(12),
                                      placeholder_text="ffmpeg.exe 路径（留空自动检测）")
        self.e_ffmpeg.pack(side="left", padx=(0, 6))
        if self._s.get("ffmpeg_path"):
            self.e_ffmpeg.insert(0, self._s["ffmpeg_path"])

        ctk.CTkButton(ff_btn_row, text="浏览", width=60, height=32,
                      font=font(12), command=self._pick_ffmpeg).pack(side="left", padx=(0, 6))
        ctk.CTkButton(ff_btn_row, text="下载 ffmpeg", width=110, height=32,
                      fg_color="#1a3a2a", hover_color="#2a5a3a",
                      font=font(12), command=self._download_ffmpeg).pack(side="left")

        # 底部按钮
        br = ctk.CTkFrame(self, fg_color="transparent"); br.pack(fill="x", padx=24, pady=(12,16))
        ctk.CTkButton(br, text="完成", width=120, height=38,
                      font=font(13), command=self._save_and_close).pack(side="right")

    def _on_theme_changed(self, choice: str):
        """下拉框切换 → 即时预览（立刻刷新整个主窗口）"""
        key = self._label_to_key.get(choice, "dark_blue")
        self._s["theme_preset"] = key
        from config import apply_theme
        apply_theme(key)
        # 完整刷新主窗口：导航栏 + 内容区全部重建
        p = self._parent
        p._navbar.configure(fg_color=tc()["bg_nav"])
        p._navbar.rebuild(p._nav.stack)
        p._refresh()  # 内容区也即时刷新
        p.update_idletasks()

    def _sec(self, title):
        ctk.CTkLabel(self, text=title, font=font(11),
                     text_color=tc()["text_dim"]).pack(anchor="w", padx=24, pady=(6,3))

    def _switch(self, label, key):
        row = ctk.CTkFrame(self, fg_color="transparent"); row.pack(fill="x", padx=24, pady=(0,4))
        ctk.CTkLabel(row, text=label, font=font(12), anchor="w").pack(side="left", fill="x", expand=True)
        var = ctk.BooleanVar(value=self._s.get(key, False))
        setattr(self, f"v_{key}", var)
        ctk.CTkSwitch(row, text="", variable=var, width=48).pack(side="right")

    def _pick_ffmpeg(self):
        path = filedialog.askopenfilename(title="选择 ffmpeg.exe",
            filetypes=[("ffmpeg 可执行文件","ffmpeg.exe *.exe"),("所有文件","*.*")])
        if path:
            self.e_ffmpeg.delete(0, "end")
            self.e_ffmpeg.insert(0, path)
            self._refresh_ffmpeg_status(path)

    def _download_ffmpeg(self):
        """打开 ffmpeg 下载页面（精简版，约 10MB）"""
        import webbrowser
        webbrowser.open("https://www.gyan.dev/ffmpeg/builds/")
        # 同时弹个提示
        from utils import show_toast
        show_toast(self._parent,
                   "已在浏览器打开下载页 → 下载 ffmpeg-release-essentials.zip → 解压取 bin/ffmpeg.exe → 放到软件同目录或在此处指定路径",
                   ms=6000)

    def _refresh_ffmpeg_status(self, custom_path: str = ""):
        """重新探测 ffmpeg 并刷新状态标签"""
        import subprocess
        paths_to_try = []
        if custom_path:
            paths_to_try.append(custom_path)
        from utils import _FFMPEG_PATHS
        paths_to_try.extend(_FFMPEG_PATHS)
        found = ""
        for p in paths_to_try:
            try:
                r = subprocess.run([p, "-version"], capture_output=True, timeout=5)
                if r.returncode == 0:
                    found = p
                    break
            except Exception:
                continue
        if found:
            self._lbl_ffmpeg.configure(
                text=f"✅ 已就绪：{found}",
                text_color=tc()["watched_fg"])
        else:
            self._lbl_ffmpeg.configure(
                text="❌ 未检测到 ffmpeg，视频宫格将显示占位图",
                text_color=tc()["text_muted"])

    def _pick_player(self):
        path = filedialog.askopenfilename(title="选择播放器",
            filetypes=[("可执行文件","*.exe"),("所有文件","*.*")])
        if path: self.e_player.delete(0,"end"); self.e_player.insert(0, path)

    def _refetch_all(self):
        self.destroy()
        if self._on_refetch: self._on_refetch()

    def _save_and_close(self):
        """保存非主题设置并关闭"""
        label = self.v_theme_preset.get()
        self._s["theme_preset"]    = self._label_to_key.get(label, "dark_blue")
        self._s["show_hidden"]     = self.v_show_hidden.get()
        self._s["auto_filter"]     = self.v_auto_filter.get()
        self._s["auto_fetch"]      = self.v_auto_fetch.get()
        self._s["filter_keywords"] = self.e_filter.get().strip()
        self._s["player_path"]     = self.e_player.get().strip()
        # 保存 ffmpeg 自定义路径，并让 utils 重新探测
        ffmpeg_path = self.e_ffmpeg.get().strip()
        self._s["ffmpeg_path"] = ffmpeg_path
        if ffmpeg_path:
            import utils as _u
            _u._ffmpeg_exe     = ffmpeg_path
            _u._ffmpeg_checked = True
        else:
            # 重置探测缓存，下次用时重新扫描
            import utils as _u
            _u._ffmpeg_exe     = None
            _u._ffmpeg_checked = False
        self._on_save(self._s)
        self.destroy()
