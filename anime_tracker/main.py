"""入口 + App 顶层路由"""
import os, sys, time, threading, logging

# EXE 打包后需要把自身目录加入搜索路径
if getattr(sys, 'frozen', False):
    # PyInstaller 打包后
    sys.path.insert(0, os.path.join(sys._MEIPASS, 'anime_tracker'))
else:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from functools import partial
import customtkinter as ctk
from tkinter import filedialog
import tkinter as tk

# 日志系统
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            os.path.join(os.path.expanduser("~"), ".kiroq.log"),
            encoding="utf-8", mode="a"),
    ]
)
log = logging.getLogger("main")

from config import (APP_NAME, APP_VERSION, SORT_OPTIONS,
                    DEFAULT_FILTER_KEYWORDS, tc, apply_theme)
from core.data_manager import (DataManager, np, scan_folder,
                                get_display_name, is_anime_folder, natural_key)
from core.state import NavState
from core.models import FolderMeta
from utils import (font, show_toast, open_video, invalidate_cover,
                    clean_search_keyword, get_video_duration)
from dialogs import EditMetaDialog, SettingsDialog
from ui.nav import NavBar
from ui.grid import AnimeGrid
from ui.detail import DetailPage
from ui.menus import SortMenu, CardContextMenu
from ui.smooth_scroll import SmoothScrollFrame
import bangumi as bgm


class AnimeTrackerApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self._dm         = DataManager()
        s                = self._dm.settings()
        apply_theme(s.get("theme_preset", "dark_blue"))
        ctk.set_default_color_theme("blue")

        self.title(f"{APP_NAME}  v{APP_VERSION}")
        self.geometry("980x700")
        self.minsize(700, 500)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # 图标（EXE 打包后图标已嵌入 .exe，源码运行时从文件加载）
        try:
            if getattr(sys, 'frozen', False):
                # PyInstaller 已通过 --icon 嵌入，不需要额外处理
                pass
            else:
                _icon_dir = os.path.dirname(os.path.abspath(__file__))
                _ico_path = os.path.join(_icon_dir, "kiroq.ico")
                _png_path = os.path.join(_icon_dir, "1.png")
                if os.path.exists(_ico_path):
                    self.iconbitmap(_ico_path)
                elif os.path.exists(_png_path):
                    self.iconphoto(True, tk.PhotoImage(file=_png_path))
        except Exception:
            pass

        self._nav              = NavState()
        self._search_var       = ctk.StringVar()
        self._image_refs       = []
        self._show_clean_names = True   # 默认显示清洗后的短名称
        self._fetch_queue: list[str] = []   # 待自动抓取队列
        self._scanning_durations = False   # 时长扫描防重入
        self._resize_job = None
        self._last_width = 0

        # 把设置里保存的 ffmpeg 路径注入 utils，避免每次重新探测
        saved_ff = s.get("ffmpeg_path", "")
        if saved_ff and os.path.isfile(saved_ff):
            import utils as _u
            _u._ffmpeg_exe     = saved_ff
            _u._ffmpeg_checked = True

        self._build_ui()
        self._bind_keys()
        self.bind("<Configure>", self._on_window_resize, add="+")

        root = np(self._dm.data.get("root",""))
        if root and os.path.isdir(root):
            self.after(120, partial(self._enter_folder, root, "首页", True))
        else:
            self.after(120, self._show_welcome)

    # ── UI 骨架 ────────────────────────────────────────
    def _build_ui(self):
        self._navbar = NavBar(self, self._go_home, self._pick_root,
                              self._open_settings, self._search_var)
        self._navbar._nav_to = self._enter_folder   # 注入导航回调
        self._search_var.trace_add("write", self._on_search)

        self.content = ctk.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.content.pack(fill="both", expand=True)

    def _bind_keys(self):
        self.bind("<BackSpace>", lambda e: self._go_back())
        self.bind("<Control-f>", lambda e: self._navbar.search_entry.focus())
        self.bind("<F5>",        lambda e: self._refresh())
        self.bind("<Escape>",    lambda e: self._search_var.set(""))

    def _on_window_resize(self, event):
        """窗口宽度变化时防抖刷新（仅主窗口事件）"""
        if event.widget is not self:
            return
        new_w = self.winfo_width()
        if self._last_width == 0:
            self._last_width = new_w
            return
        if abs(new_w - self._last_width) > 50:
            self._last_width = new_w
            if self._resize_job:
                self.after_cancel(self._resize_job)
            self._resize_job = self.after(200, self._refresh)

    def _clear(self):
        for w in self.content.winfo_children(): w.destroy()
        self._image_refs.clear()

    def _on_close(self):
        self._dm.flush()
        self.destroy()

    # ── 导航 ──────────────────────────────────────────
    def _enter_folder(self, folder_path: str, name: str, reset: bool = False):
        folder_path = np(folder_path)
        if reset: self._nav.reset(folder_path, name)
        else:     self._nav.push(folder_path, name)
        self._navbar.rebuild(self._nav.stack)
        self._clear()

        root = np(self._dm.data.get("root",""))
        if folder_path == root:
            self._show_root(folder_path)
        else:
            self._show_detail(folder_path)
            # 自动抓取
            if self._dm.settings().get("auto_fetch", True):
                meta = self._dm.get_meta(folder_path)
                if not meta.fetched:
                    self._auto_fetch(folder_path)

    def _go_home(self):
        root = np(self._dm.data.get("root",""))
        if root and os.path.isdir(root): self._enter_folder(root, "首页", reset=True)
        else: self._show_welcome()

    def _go_back(self):
        prev = self._nav.pop()
        if prev:
            path, name = prev
            self._nav.push(path, name)
            self._enter_folder(path, name)

    def _refresh(self):
        cur = self._nav.current
        if cur:
            path, name = cur
            self._nav.stack.pop()
            self._enter_folder(path, name)

    # ── 搜索 ──────────────────────────────────────────
    def _on_search(self, *_):
        root = np(self._dm.data.get("root",""))
        if not root or not os.path.isdir(root): return
        cur = self._nav.current
        if cur and cur[0] == root:
            self._show_root(root, search=self._search_var.get().strip())

    # ── 根目录主页 ────────────────────────────────────
    def _show_root(self, root: str, search: str = ""):
        self._clear()
        subdirs, videos = scan_folder(root)
        s               = self._dm.settings()
        auto_filter     = s.get("auto_filter", True)
        show_hidden     = s.get("show_hidden", False)

        # 过滤
        def should_show(d: str) -> bool:
            fp = np(os.path.join(root, d))
            if self._dm.is_hidden(fp) and not show_hidden: return False
            if not is_anime_folder(fp, auto_filter, s): return False
            if search and search.lower() not in d.lower() and \
               search.lower() not in get_display_name(fp, self._dm.get_meta(fp)).lower():
                return False
            return True

        visible = [d for d in subdirs if should_show(d)]
        sorted_dirs = self._sorted(root, visible)

        # 工具栏
        toolbar = ctk.CTkFrame(self.content, height=44, corner_radius=0,
                               fg_color=tc()["bg_toolbar"])
        toolbar.pack(fill="x"); toolbar.pack_propagate(False)

        # 统计面板
        total_watched = sum(len(v) for v in self._dm.data["watched"].values())
        total_watching = len([d for d in subdirs
                              if self._dm.get_meta(np(os.path.join(root,d))).status=="watching"])
        total_done     = len([d for d in subdirs
                              if self._dm.get_meta(np(os.path.join(root,d))).status=="done"])
        # 累计观看时间（优先用 ffprobe 缓存，没有则估算）
        total_seconds, scanned, _ = self._calc_watch_time()
        t_str = self._fmt_duration(int(total_seconds))
        stat_str = (f"📺 在看 {total_watching}  ✅ 完结 {total_done}  "
                    f"▶ 已看 {total_watched} 集  ⏱ {t_str}")
        ctk.CTkLabel(toolbar, text=stat_str, font=font(11),
                     text_color=tc()["text_dim"]).pack(side="left", padx=12)
        # 后台补充扫描未缓存的视频
        if scanned > 0:
            self.after(300, lambda: self._scan_durations_bg(root))

        # 切换：显示清洗后的短名 / 原始名
        def toggle_names():
            self._show_clean_names = not self._show_clean_names
            t_ = tc()
            btn_name_toggle.configure(
                text="📝 短名" if self._show_clean_names else "📝 原名",
                fg_color=t_["btn_toggle_b"] if self._show_clean_names else t_["btn_toggle_a"])
            self._refresh()

        t_ = tc()
        btn_name_toggle = ctk.CTkButton(toolbar,
            text="📝 短名" if self._show_clean_names else "📝 原名",
            width=90, height=30,
            fg_color=t_["btn_toggle_b"] if self._show_clean_names else t_["btn_toggle_a"],
            hover_color=t_["hover"], font=font(11),
            command=toggle_names)
        btn_name_toggle.pack(side="right", padx=(0, 6), pady=7)

        # 排序按钮
        sort_key = self._dm.data.get("sort_key","name")
        sl = next((l for l,k in SORT_OPTIONS if k==sort_key),"排序")
        sl += " ↓" if self._dm.data.get("sort_desc") else " ↑"
        btn_sort = ctk.CTkButton(toolbar, text=f"↕  {sl}", width=160, height=30,
                                  fg_color=t_["btn_toggle_a"], hover_color=t_["hover"], font=font(12),
                                  command=lambda: SortMenu(self, btn_sort, self._dm,
                                                           partial(self._show_root, root, search)))
        btn_sort.pack(side="right", padx=12, pady=7)

        if search:
            ctk.CTkLabel(toolbar, text=f"搜索「{search}」— {len(visible)} 个结果",
                         font=font(12), text_color=tc()["text_muted"]).pack(side="right", padx=8)

        scroll = SmoothScrollFrame(self.content, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        if visible:
            grid = AnimeGrid(scroll.content, self._dm, self._image_refs,
                             on_enter=self._enter_folder,
                             on_right_click=self._card_rclick)
            grid.render(root, sorted_dirs, clean_display=self._show_clean_names)
        elif search:
            ctk.CTkLabel(scroll.content, text="没有找到匹配的番剧",
                         font=font(13), text_color=tc()["text_dim"]).pack(pady=40)

        # 根目录直接放的视频
        if videos:
            if visible:
                ctk.CTkLabel(scroll.content, text="根目录视频", font=font(13),
                             text_color=tc()["text_dim"], anchor="w").pack(anchor="w", pady=(12,4))
            from ui.video_list import VideoList
            vf = ctk.CTkFrame(scroll.content, fg_color="transparent"); vf.pack(fill="x")
            vl = VideoList(vf, self._dm, root, videos,
                           on_open=partial(self._open_video, folder_path=root))
            vl.refresh()

    # ── 详情页 ────────────────────────────────────────
    def _show_detail(self, folder_path: str):
        dp = DetailPage(
            parent         = self.content,
            dm             = self._dm,
            image_refs     = self._image_refs,
            on_enter_folder= self._enter_folder,
            on_open_video  = self._open_video,
            on_edit_meta   = self._open_edit,
            app_win        = self,
            render_grid_fn = self._render_sub_grid,
        )
        dp.render(folder_path, clean_display=self._show_clean_names)

    def _render_sub_grid(self, parent, folder_path: str, dirs: list[str]):
        s           = self._dm.settings()
        auto_filter = s.get("auto_filter", True)
        show_hidden = s.get("show_hidden", False)
        visible = [d for d in dirs
                   if (show_hidden or not self._dm.is_hidden(np(os.path.join(folder_path,d))))
                   and is_anime_folder(np(os.path.join(folder_path,d)), auto_filter, s)]
        sorted_dirs = self._sorted(folder_path, visible)
        grid = AnimeGrid(parent, self._dm, self._image_refs,
                         on_enter=self._enter_folder,
                         on_right_click=self._card_rclick)
        grid.render(folder_path, sorted_dirs, clean_display=self._show_clean_names)

    # ── 排序 ──────────────────────────────────────────
    def _sorted(self, parent: str, dirs: list[str]) -> list[str]:
        key    = self._dm.data.get("sort_key","name")
        desc   = self._dm.data.get("sort_desc", False)
        pinned = self._dm.data.get("pinned",[])

        def key_fn(d):
            p = np(os.path.join(parent,d))
            if key == "last_watched": return self._dm.data["last_watched_time"].get(p,0)
            if key == "added_time":   return self._dm.data["added_time"].get(p,0)
            return natural_key(d)

        pinned_d   = [d for d in dirs if np(os.path.join(parent,d)) in pinned]
        unpinned_d = [d for d in dirs if np(os.path.join(parent,d)) not in pinned]
        pinned_d.sort(  key=key_fn, reverse=desc)
        unpinned_d.sort(key=key_fn, reverse=desc)
        return pinned_d + unpinned_d

    # ── 视频打开 ──────────────────────────────────────
    def _open_video(self, file_path: str, folder_path: str):
        player = self._dm.settings().get("player_path","")
        open_video(file_path, player)
        self._dm.mark_watched(file_path, folder_path)

    # ── 右键菜单 ──────────────────────────────────────
    def _card_rclick(self, event, folder_path: str, display_name: str):
        CardContextMenu(self, event, folder_path, display_name,
                        self._dm, self._refresh, self)

    # ── 编辑信息 ──────────────────────────────────────
    def _open_edit(self, folder_path: str):
        meta = self._dm.get_meta(folder_path)
        def on_save(new_meta: FolderMeta):
            new_meta.fetched = True
            self._dm.set_meta(folder_path, new_meta)
            invalidate_cover(folder_path)
            new_name = get_display_name(folder_path, new_meta)
            if self._nav.current and self._nav.current[0] == folder_path:
                self._nav.stack[-1] = (folder_path, new_name)
            self._navbar.rebuild(self._nav.stack)
            self._refresh()
            show_toast(self, "✓ 信息已保存")
        EditMetaDialog(self, folder_path, meta, on_save)

    # ── 欢迎页 ────────────────────────────────────────
    def _show_welcome(self):
        self._clear(); self._nav.stack=[]; self._navbar.rebuild([])
        f = ctk.CTkFrame(self.content, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")
        ctk.CTkLabel(f, text="🎬", font=font(56)).pack(pady=(0,12))
        ctk.CTkLabel(f, text="还没有设置动漫根目录",
                     font=font(18,"bold"), text_color=tc()["text_main"]).pack()
        ctk.CTkLabel(f, text="选择存放动漫的总文件夹，软件会自动读取里面每部番剧",
                     font=font(13), text_color=tc()["text_muted"]).pack(pady=(6,20))
        ctk.CTkButton(f, text="选择根目录", width=160, height=40,
                      font=font(13), command=self._pick_root).pack()

    def _pick_root(self):
        path = filedialog.askdirectory(title="选择动漫根目录")
        if path:
            self._dm.data["root"] = np(path)
            self._dm.save(immediate=True)
            self._enter_folder(np(path), "首页", reset=True)

    # ── 设置 ──────────────────────────────────────────
    def _open_settings(self):
        def on_save(s):
            self._dm.set_settings(s)
            # 主题切换必须在弹窗销毁后执行，避免冲突
            self.after(50, lambda: self._apply_theme_and_refresh(s))
        SettingsDialog(self, self._dm.settings(), on_save,
                       on_refetch_all=self._refetch_all)

    def _apply_theme_and_refresh(self, s: dict):
        """弹窗关闭后：应用主题 → 重建导航栏 → 刷新内容"""
        apply_theme(s.get("theme_preset", "dark_blue"))
        self._navbar.configure(fg_color=tc()["bg_nav"])
        self._navbar.rebuild(self._nav.stack)
        self.update_idletasks()
        show_toast(self, "✓ 设置已保存")
        self._refresh()

    # ── 观看时长 ──────────────────────────────────────
    def _calc_watch_time(self) -> tuple[float, int, float]:
        """计算累计观看时长 (精确秒数, 估算集数, 估算秒数)

        遍历已看列表，优先用 ffprobe 缓存。值为 -1 表示 ffprobe 不可用。
        """
        precise = 0.0
        estimated_count = 0
        for folder, vlist in self._dm.data["watched"].items():
            for v in vlist:
                dur = self._dm.get_duration(v)
                if dur is not None and dur > 0:
                    precise += dur
                else:
                    estimated_count += 1
        estimated_sec = estimated_count * 24 * 60
        return precise, estimated_count, estimated_sec

    @staticmethod
    def _fmt_duration(total_seconds: int) -> str:
        """秒数 → 'X 小时 Y 分钟'"""
        if total_seconds <= 0:
            return "不到 1 分钟"
        h, remainder = divmod(total_seconds, 3600)
        m = remainder // 60
        if h > 0:
            return f"{h} 小时 {m} 分钟" if m else f"{h} 小时"
        else:
            return f"{m} 分钟"

    def _scan_durations_bg(self, root_folder: str):
        """后台线程：扫描已看但未缓存的视频时长（防重入）"""
        if self._scanning_durations:
            return
        import threading
        # 收集待扫描文件（dur 为 None 的才扫，-1 已标记跳过）
        to_scan = []
        for folder, vlist in self._dm.data["watched"].items():
            for v in vlist:
                if self._dm.get_duration(v) is None:
                    to_scan.append(v)
        if not to_scan:
            return

        self._scanning_durations = True
        log.info(f"duration scan: {len(to_scan)} uncached files")
        sem = threading.Semaphore(3)
        scanned_count = [0]  # 用列表在线程间共享

        def scan_one(fp):
            with sem:
                dur = get_video_duration(fp)
                # 有值存值，没有存 -1 标记"已扫过不再重试"
                self._dm.set_duration(fp, dur if dur is not None else -1)
                scanned_count[0] += 1

        def run():
            threads = []
            for fp in to_scan:
                t = threading.Thread(target=scan_one, args=(fp,), daemon=True)
                threads.append(t)
                t.start()
            for t in threads:
                t.join()
            self._scanning_durations = False
            # 只在有变化时刷新一次
            if scanned_count[0] > 0:
                self.after(0, lambda: self._refresh_stats_only())

        threading.Thread(target=run, daemon=True).start()

    def _refresh_stats_only(self):
        """只刷新主页统计栏（不重建整个页面）"""
        cur = self._nav.current
        if cur:
            self._enter_folder(cur[0], cur[1])

    # ── 自动抓取（单个，后台线程）────────────────────
    def _auto_fetch(self, folder_path: str):
        keyword = clean_search_keyword(os.path.basename(folder_path))
        log.info(f"auto_fetch: {keyword}")
        def run():
            results = bgm.search(keyword, limit=5)
            match   = bgm.best_match(keyword, results)
            if not match:
                log.info(f"auto_fetch no match: {keyword}")
                return
            full = bgm.get_subject(match["id"]) or match
            full["link"] = f"https://bgm.tv/subject/{match['id']}"
            cover_path = bgm.download_cover(full.get("image",""), folder_path)
            self.after(0, partial(self._apply_fetch, folder_path, full, cover_path))
        threading.Thread(target=run, daemon=True).start()

    def _apply_fetch(self, folder_path: str, data: dict, cover_path: str | None):
        meta = self._dm.get_meta(folder_path)
        if data.get("name_cn") and not meta.name:
            meta.name = data["name_cn"]
        if data.get("summary") and not meta.desc:
            meta.desc = data["summary"]
        if data.get("link") and not meta.link:
            meta.link = data["link"]
        if data.get("rating") and not meta.rating:
            meta.rating = data["rating"]
        if cover_path and not meta.cover:
            meta.cover = cover_path
        meta.fetched = True
        meta.bgm_id  = data.get("id")
        self._dm.set_meta(folder_path, meta)
        invalidate_cover(folder_path)
        log.info(f"auto_fetch applied: {folder_path}")

    # ── 重新抓取全部 ──────────────────────────────────
    def _refetch_all(self):
        root = np(self._dm.data.get("root",""))
        if not root: return
        subdirs, _ = scan_folder(root)
        total   = len(subdirs)
        if total == 0: return

        show_toast(self, f"⏳ 开始重新抓取全部 {total} 部番剧…", ms=3000)
        log.info(f"refetch_all: {total} folders")

        # 限制并发为 3
        sem = threading.Semaphore(3)

        def fetch_one(folder_path):
            with sem:
                keyword = clean_search_keyword(os.path.basename(folder_path))
                results = bgm.search(keyword, limit=5)
                match   = bgm.best_match(keyword, results)
                if not match: return
                full = bgm.get_subject(match["id"]) or match
                full["link"] = f"https://bgm.tv/subject/{match['id']}"
                cover = bgm.download_cover(full.get("image",""), folder_path)
                # 重置 fetched 让 _apply_fetch 强制覆盖
                self.after(0, partial(self._apply_fetch_force, folder_path, full, cover))

        def run_all():
            threads = []
            for d in subdirs:
                fp = np(os.path.join(root, d))
                t  = threading.Thread(target=fetch_one, args=(fp,), daemon=True)
                threads.append(t); t.start()
            for t in threads: t.join()
            self.after(0, partial(show_toast, self, f"✓ 全部 {total} 部抓取完成", 3000))

        threading.Thread(target=run_all, daemon=True).start()

    def _apply_fetch_force(self, folder_path, data, cover_path):
        """强制覆盖已有数据（用于重新抓取全部）"""
        meta = self._dm.get_meta(folder_path)
        if data.get("name_cn"): meta.name = data["name_cn"]
        if data.get("summary"): meta.desc  = data["summary"]
        if data.get("link"):    meta.link  = data["link"]
        if data.get("rating"):  meta.rating= data["rating"]
        if cover_path:          meta.cover = cover_path
        meta.fetched = True
        meta.bgm_id  = data.get("id")
        self._dm.set_meta(folder_path, meta)
        invalidate_cover(folder_path)


# ── 文件夹名清洗（用于 Bangumi 搜索）────────────────────
# ── 辅助（兼容 data_manager 里的 get_sub_dirs）────────
def get_sub_dirs(folder: str) -> list[str]:
    subdirs, _ = scan_folder(folder)
    return subdirs


if __name__ == "__main__":
    log.info(f"starting {APP_NAME} {APP_VERSION}")
    app = AnimeTrackerApp()
    app.mainloop()
