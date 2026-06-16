"""入口 + App 顶层路由"""
import os, sys, time, threading, logging
from collections import OrderedDict

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
        self.minsize(700, 500)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # 恢复上次窗口大小/位置
        s = self._dm.settings()
        saved_geo = s.get("win_geometry", "")
        if saved_geo:
            try:
                self.geometry(saved_geo)
            except Exception:
                self.geometry("980x700")
        else:
            self.geometry("980x700")

        # 监听窗口变化（防抖保存）
        self._geom_save_job: str | None = None
        self.bind("<Configure>", self._on_configure, add="+")

        # 图标
        try:
            if getattr(sys, 'frozen', False):
                _ico_path = os.path.join(sys._MEIPASS, "anime_tracker", "kiroq.ico")
            else:
                _ico_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kiroq.ico")
            if os.path.exists(_ico_path):
                self.iconbitmap(_ico_path)
        except Exception:
            pass

        self._nav              = NavState()
        self._search_var       = ctk.StringVar()
        self._image_refs       = []
        self._show_clean_names = True
        self._fetch_queue: list[str] = []
        self._scanning_durations = False
        self._root_grid = None       # AnimeGrid 引用（多选用）
        self._grid_select_bar = None # 宫格多选操作栏

        # 页面 LRU 缓存：OrderedDict {path: {frame, width}}，上限 6
        self._page_cache: OrderedDict[str, dict] = OrderedDict()
        self._max_cached = 6
        self._current_page: ctk.CTkFrame | None = None
        self._current_path: str = ""

        self._build_ui()
        self._bind_keys()

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
        self.bind("<Escape>",    lambda e: self._exit_all_select())

    def _clear_page_cache(self):
        """清空所有缓存的页面"""
        for data in self._page_cache.values():
            try: data["frame"].destroy()
            except Exception: pass
        self._page_cache.clear()
        self._current_page = None
        self._current_path = ""

    def _evict_lru(self):
        """超过上限时销毁最旧的缓存页"""
        while len(self._page_cache) > self._max_cached:
            _, data = self._page_cache.popitem(last=False)
            try: data["frame"].destroy()
            except Exception: pass

    def _on_close(self):
        self._save_window_geometry()
        self._dm.flush()
        self.destroy()

    # ── 窗口位置/大小记忆 ──────────────────────────────
    def _on_configure(self, event):
        """窗口移动/缩放时防抖保存几何信息"""
        # 只响应顶层窗口自身的 Configure
        if event.widget != self:
            return
        if self._geom_save_job:
            self.after_cancel(self._geom_save_job)
        self._geom_save_job = self.after(800, self._save_window_geometry)

    def _save_window_geometry(self):
        """保存当前窗口大小和位置到设置"""
        self._geom_save_job = None
        try:
            # 最小化/关闭中不保存（坐标可能是负数）
            if self.state() == "normal":
                geo = self.geometry()  # 格式: "WxH+X+Y"
                s = self._dm.settings()
                if s.get("win_geometry", "") != geo:
                    s["win_geometry"] = geo
                    self._dm.set_settings(s)
        except Exception:
            pass

    def _clear(self):
        for w in self.content.winfo_children(): w.destroy()
        self._image_refs.clear()

    # ── 导航（LRU 页面缓存：回退不重建，最多 6 页）──
    def _enter_folder(self, folder_path: str, name: str, reset: bool = False):
        folder_path = np(folder_path)
        if reset: self._nav.reset(folder_path, name)
        else:     self._nav.push(folder_path, name)
        self._navbar.rebuild(self._nav.stack)

        cur_w = self.winfo_width()

        # 隐藏当前页
        if self._current_page and self._current_page.winfo_exists():
            self._current_page.pack_forget()

        # 缓存命中
        if folder_path in self._page_cache:
            self._page_cache.move_to_end(folder_path)
            data = self._page_cache[folder_path]
            page = data["frame"]
            page.pack(fill="both", expand=True)
            self._current_page = page
            self._current_path = folder_path
            # 宽度变了 → 触发 grid 重排
            if abs(data.get("width", 0) - cur_w) > 30:
                data["width"] = cur_w
                self._reflow_cached_page(page, cur_w)
            return

        # 缓存未命中 → 构建
        page = ctk.CTkFrame(self.content, corner_radius=0, fg_color="transparent")
        page.pack(fill="both", expand=True)
        self._page_cache[folder_path] = {"frame": page, "width": cur_w}
        self._page_cache.move_to_end(folder_path)
        self._evict_lru()
        self._current_page = page
        self._current_path = folder_path

        root = np(self._dm.data.get("root",""))
        if folder_path == root:
            self._show_root(folder_path)
        else:
            self._show_detail(folder_path)
            if self._dm.settings().get("auto_fetch", True):
                meta = self._dm.get_meta(folder_path)
                if not meta.fetched:
                    self._auto_fetch(folder_path)

    def _reflow_cached_page(self, page: ctk.CTkFrame, width: int):
        """缓存页恢复后，找到内部 Grid 强制重排（不管宽度是否变化）"""
        for child in page.winfo_children():
            if hasattr(child, "_check_reflow"):
                # 重置 _last_resize_w 确保 _on_resize 不跳过
                child._last_resize_w = 0
                child.update_idletasks()
                child._check_reflow()
                return

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

    def _exit_all_select(self):
        """Esc 退出所有选择模式"""
        if self._search_var.get():
            self._search_var.set("")
        elif self._root_grid and self._root_grid.in_select_mode:
            self._exit_grid_select()
        # 详情页的选择退出由 detail.py 自行处理（不在当前页时不触发）

    def _refresh(self):
        """F5 刷新：清除当前页缓存，强制重建"""
        if self._current_path and self._current_path in self._page_cache:
            data = self._page_cache.pop(self._current_path)
            try: data["frame"].destroy()
            except Exception: pass
        self._current_page = None
        self._current_path = ""
        cur = self._nav.current
        if cur:
            self._nav.stack.pop()
            self._enter_folder(cur[0], cur[1])

    # ── 搜索 ──────────────────────────────────────────
    def _on_search(self, *_):
        root = np(self._dm.data.get("root",""))
        if not root or not os.path.isdir(root): return
        cur = self._nav.current
        if cur and cur[0] == root:
            # 搜索时清除首页缓存，强制重建以显示搜索结果
            if root in self._page_cache:
                data = self._page_cache.pop(root)
                try: data["frame"].destroy()
                except Exception: pass
            if self._current_page:
                self._current_page.pack_forget()
                self._current_page = None
            page = ctk.CTkFrame(self.content, corner_radius=0, fg_color="transparent")
            page.pack(fill="both", expand=True)
            self._page_cache[root] = {"frame": page, "width": self.winfo_width()}
            self._current_page = page
            self._current_path = root
            self._show_root(root, search=self._search_var.get().strip())

    # ── 根目录主页 ────────────────────────────────────
    def _show_root(self, root: str, search: str = ""):
        # 清除旧内容（缓存页是新建的，只清上次渲染的残留）
        page = self._current_page or self.content
        for w in page.winfo_children():
            w.destroy()
        self._image_refs.clear()
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
        # 记录首次出现时间（用于按添加时间排序）
        for d in visible:
            self._dm.record_added(np(os.path.join(root, d)))
        sorted_dirs = self._sorted(root, visible)

        # 工具栏
        toolbar = ctk.CTkFrame(page, height=44, corner_radius=0,
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
                     text_color=tc()["text_main"]).pack(side="left", padx=12)
        # 后台补充扫描未缓存的视频
        if scanned > 0:
            self.after(300, lambda: self._scan_durations_bg(root))

        # 切换：显示清洗后的短名 / 原始名
        def toggle_names():
            self._show_clean_names = not self._show_clean_names
            t_ = tc()
            btn_name_toggle.configure(
                text="📝 短名" if self._show_clean_names else "📝 原名",
                fg_color=t_["btn_toggle_b"] if self._show_clean_names else t_["btn_toggle_a"],
                text_color=t_["text_main"])
            self._refresh()

        t_ = tc()
        btn_name_toggle = ctk.CTkButton(toolbar,
            text="📝 短名" if self._show_clean_names else "📝 原名",
            width=90, height=30,
            fg_color=t_["btn_toggle_b"] if self._show_clean_names else t_["btn_toggle_a"],
            hover_color=t_["hover"], font=font(11),
            text_color=t_["text_main"], command=toggle_names)
        btn_name_toggle.pack(side="right", padx=(0, 6), pady=7)

        # 排序按钮
        sort_key = self._dm.data.get("sort_key","name")
        sl = next((l for l,k in SORT_OPTIONS if k==sort_key),"排序")
        sl += " ↓" if self._dm.data.get("sort_desc") else " ↑"
        btn_sort = ctk.CTkButton(toolbar, text=f"↕  {sl}", width=160, height=30,
                                  fg_color=t_["btn_toggle_a"], hover_color=t_["hover"], font=font(12),
                                  text_color=t_["text_main"],
                                  command=lambda: SortMenu(self, btn_sort, self._dm,
                                                           partial(self._show_root, root, search)))
        btn_sort.pack(side="right", padx=12, pady=7)

        if search:
            ctk.CTkLabel(toolbar, text=f"搜索「{search}」— {len(visible)} 个结果",
                         font=font(12), text_color=tc()["text_muted"]).pack(side="right", padx=8)

        scroll = SmoothScrollFrame(page, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        if visible:
            grid = AnimeGrid(scroll.content, self._dm, self._image_refs,
                             on_enter=self._enter_folder,
                             on_right_click=self._card_rclick)
            grid.set_selection_callback(self._show_grid_select_bar)
            grid.render(root, sorted_dirs, clean_display=self._show_clean_names)
            self._root_grid = grid
        elif search:
            ctk.CTkLabel(scroll.content, text="没有找到匹配的番剧",
                         font=font(13), text_color=tc()["text_dim"]).pack(pady=40)

        # 根目录直接放的视频
        if videos:
            t_ = tc()
            # 标题行：左侧「根目录视频」+ 右侧列表/宫格切换按钮
            vid_hdr = ctk.CTkFrame(scroll.content, fg_color="transparent")
            vid_hdr.pack(fill="x", anchor="w", pady=((16 if visible else 0), 4))
            ctk.CTkLabel(vid_hdr, text="根目录视频", font=font(13),
                         text_color=t_["text_dim"], anchor="w").pack(side="left")

            root_view = self._dm.data.get("root_video_view", "list")

            def _toggle_root_view(_root=root, _search=search):
                cur = self._dm.data.get("root_video_view", "list")
                self._dm.data["root_video_view"] = "grid" if cur == "list" else "list"
                self._dm.save()
                self._show_root(_root, _search)

            ctk.CTkButton(vid_hdr,
                text="🔲" if root_view == "list" else "📋",
                width=36, height=26,
                fg_color=t_["btn_toggle_a"] if root_view == "list" else t_["btn_toggle_b"],
                hover_color=t_["hover"], font=font(12),
                command=_toggle_root_view).pack(side="right")

            vf = ctk.CTkFrame(scroll.content, fg_color="transparent")
            vf.pack(fill="x")

            if root_view == "list":
                from ui.video_list import VideoList
                vl = VideoList(vf, self._dm, root, videos,
                               on_open=partial(self._open_video, folder_path=root))
                vl.refresh()
            else:
                from ui.video_grid import VideoGrid
                vg = VideoGrid(vf, self._dm, root, videos, self._image_refs,
                               on_open=self._open_video, app_win=self)
                vg.render()

            # 后台扫描根目录视频时长
            self._scan_root_videos_dur(root, videos)

    # ── 详情页 ────────────────────────────────────────
    def _show_detail(self, folder_path: str):
        page = self._current_page or self.content
        dp = DetailPage(
            parent         = page,
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
    def _card_rclick(self, event, folder_path: str, display_name: str,
                     is_selected: bool = False):
        # 是否在主页根目录（只有主页宫格才开通多选）
        root = np(self._dm.data.get("root",""))
        is_root_page = (self._nav.current and self._nav.current[0] == root)

        if self._root_grid and self._root_grid.in_select_mode:
            sel_count = len(self._root_grid.get_selected())
            if is_selected and sel_count > 1:
                menu = CardContextMenu(self, event, folder_path, display_name,
                                        self._dm, self._refresh, self,
                                        is_select_mode=True,
                                        selected_count=sel_count)
                menu._sel_paths = self._root_grid.get_selected()
                return
        CardContextMenu(self, event, folder_path, display_name,
                        self._dm, self._refresh, self,
                        on_enter_select=self._enter_grid_select if is_root_page else None)

    # ── 宫格多选 ──────────────────────────────────────
    def _enter_grid_select(self):
        """右键菜单 → 多选 → 进入宫格选择模式"""
        if self._root_grid:
            self._root_grid.enter_select_mode()

    def _exit_grid_select(self):
        """退出宫格选择模式"""
        if self._root_grid:
            self._root_grid.exit_select_mode()
        self._hide_grid_select_bar()

    def _show_grid_select_bar(self, count: int):
        """显示/更新宫格选择操作栏"""
        if count < 0:
            self._hide_grid_select_bar()
            return

        t = tc()
        if self._grid_select_bar and self._grid_select_bar.winfo_exists():
            for w in self._grid_select_bar.winfo_children():
                if hasattr(w, '_is_count_label') and w._is_count_label:
                    w.configure(text=f"已选 {count} 项")
                    break
            for w in self._grid_select_bar.winfo_children():
                if hasattr(w, '_is_batch_btn'):
                    w.configure(state="normal" if count > 0 else "disabled")
            return

        self._grid_select_bar = ctk.CTkFrame(
            self.content, height=44, corner_radius=0,
            fg_color=t["bg_toolbar"], border_width=1, border_color=t["border"])
        self._grid_select_bar.pack(side="bottom", fill="x")
        self._grid_select_bar.pack_propagate(False)

        lbl = ctk.CTkLabel(self._grid_select_bar, text=f"已选 {count} 项",
                           font=font(12), text_color=t["text_main"])
        lbl._is_count_label = True
        lbl.pack(side="left", padx=12)

        def do_select_all():
            if self._root_grid:
                self._root_grid.select_all()

        ctk.CTkButton(self._grid_select_bar, text="全选", width=60, height=28,
                      fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                      font=font(11), command=do_select_all
                      ).pack(side="left", padx=(0, 4), pady=8)

        # 取消选择（保留在选模式中，只清空勾选）
        def do_deselect():
            if self._root_grid:
                self._root_grid.deselect_all()

        ctk.CTkButton(self._grid_select_bar, text="取消", width=60, height=28,
                      fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                      font=font(11), command=do_deselect
                      ).pack(side="left", padx=(0, 8), pady=8)

        # 批量置顶
        def batch_pin():
            if not self._root_grid: return
            paths = self._root_grid.get_selected()
            pinned = self._dm.data.get("pinned", [])
            all_pinned = all(fp in pinned for fp in paths)
            if all_pinned:
                for fp in paths:
                    if fp in pinned: pinned.remove(fp)
            else:
                for fp in paths:
                    if fp not in pinned: pinned.append(fp)
            self._dm.data["pinned"] = pinned
            self._dm.save()
            show_toast(self, f"✓ {len(paths)} 项已{'取消置顶' if all_pinned else '置顶'}")
            self._exit_grid_select()
            self._refresh()

        btn_pin = ctk.CTkButton(self._grid_select_bar, text="📌 置顶", width=80, height=28,
                                fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                                font=font(11), command=batch_pin)
        btn_pin._is_batch_btn = True
        btn_pin.pack(side="left", padx=4, pady=8)

        # 批量隐藏
        def batch_hide():
            if not self._root_grid: return
            paths = self._root_grid.get_selected()
            all_hidden = all(self._dm.is_hidden(fp) for fp in paths)
            for fp in paths:
                if all_hidden:
                    self._dm.data["hidden"].discard(fp)
                else:
                    self._dm.data["hidden"].add(fp)
            self._dm.save()
            show_toast(self, f"✓ {len(paths)} 项已{'取消隐藏' if all_hidden else '隐藏'}")
            self._exit_grid_select()
            self._refresh()

        btn_hide = ctk.CTkButton(self._grid_select_bar, text="👁 隐藏", width=80, height=28,
                                 fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                                 font=font(11), command=batch_hide)
        btn_hide._is_batch_btn = True
        btn_hide.pack(side="left", padx=4, pady=8)

        # 批量清除
        def batch_clear():
            if not self._root_grid: return
            paths = self._root_grid.get_selected()
            if confirm_dialog(self, "批量清除",
                              f"确定清除 {len(paths)} 个番剧的所有观看记录？"):
                for fp in paths:
                    self._dm.clear_watched(fp)
                show_toast(self, f"✓ 已清除 {len(paths)} 项记录")
                self._exit_grid_select()
                self._refresh()

        btn_clear = ctk.CTkButton(self._grid_select_bar, text="🗑 清记录", width=80, height=28,
                                  fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                                  font=font(11), command=batch_clear)
        btn_clear._is_batch_btn = True
        btn_clear.pack(side="left", padx=4, pady=8)

        # 完成
        ctk.CTkButton(self._grid_select_bar, text="完成", width=60, height=28,
                      fg_color=t["accent"], hover_color=t["btn_hover"],
                      font=font(11, "bold"), command=self._exit_grid_select
                      ).pack(side="right", padx=12, pady=8)

    def _hide_grid_select_bar(self):
        if self._grid_select_bar and self._grid_select_bar.winfo_exists():
            self._grid_select_bar.destroy()
        self._grid_select_bar = None

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
        self._hide_grid_select_bar()
        self._root_grid = None
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

    def _scan_root_videos_dur(self, folder: str, videos: list[str]):
        """后台扫描根目录视频时长（非阻塞）"""
        import threading
        to_scan = []
        for v in videos:
            fp = np(os.path.join(folder, v))
            if self._dm.get_duration(fp) is None:
                to_scan.append(fp)
        if not to_scan:
            return
        def run():
            for fp in to_scan:
                dur = get_video_duration(fp)
                self._dm.set_duration(fp, dur if dur is not None else -1)
            if any(self._dm.get_duration(fp) and self._dm.get_duration(fp) > 0
                   for fp in to_scan):
                self.after(0, self._refresh)
        threading.Thread(target=run, daemon=True).start()

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
