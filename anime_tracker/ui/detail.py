"""文件夹详情页"""
import os, webbrowser, threading, logging
from functools import partial
import customtkinter as ctk
from utils import font, get_cover_ctk, clean_search_keyword, get_video_duration, show_toast
from config import SORT_OPTIONS, tc
from core.data_manager import get_display_name, scan_folder, np
from ui.video_list import VideoList
from ui.video_grid import VideoGrid
from ui.menus import SortMenu, MoreMenu
from ui.smooth_scroll import SmoothScrollFrame

log = logging.getLogger(__name__)


class DetailPage:
    def __init__(self, parent, dm, image_refs: list,
                 on_enter_folder, on_open_video,
                 on_edit_meta, app_win,
                 render_grid_fn):
        self._parent        = parent
        self._dm            = dm
        self._scanning_durations = False
        self._refs          = image_refs
        self._on_enter      = on_enter_folder
        self._on_open_video = on_open_video
        self._on_edit       = on_edit_meta
        self._app_win       = app_win
        self._render_grid   = render_grid_fn

        # ── 多选状态 ──
        self._video_list: VideoList | None = None
        self._video_grid: VideoGrid | None = None
        self._select_bar: ctk.CTkFrame | None = None

    # ── 主渲染入口 ────────────────────────────────────
    def render(self, folder_path: str, clean_display: bool = False):
        self._clean_display = clean_display
        self._folder_path   = np(folder_path)
        self._meta          = self._dm.get_meta(self._folder_path)
        self._subdirs, self._videos = scan_folder(self._folder_path)
        self._render_full()
        self._start_duration_scan()

    def _render_full(self):
        """完整渲染（首次进入时调用）"""
        for w in self._parent.winfo_children():
            w.destroy()
        self._video_list = None
        self._video_grid = None
        self._select_bar = None
        self._render_header()
        self._render_content()

    def _refresh_content(self):
        """仅刷新内容区（切换视图/排序时调用，不闪屏）"""
        # 找到并销毁 scroll 区域（第二个子控件，第一个是 top bar）
        children = self._parent.winfo_children()
        for w in children[1:]:
            w.destroy()
        self._video_list = None
        self._video_grid = None
        self._select_bar = None
        self._render_content()

    # ── 多选操作栏 ────────────────────────────────────
    def _show_select_bar(self, count: int):
        """显示/更新底部选择操作栏"""
        if count < 0:
            # -1 = 隐藏
            self._hide_select_bar()
            return

        t = tc()
        if self._select_bar and self._select_bar.winfo_exists():
            # 更新计数
            for w in self._select_bar.winfo_children():
                if hasattr(w, '_is_count_label') and w._is_count_label:
                    w.configure(text=f"已选 {count} 项")
                    break
            # 更新按钮状态
            for w in self._select_bar.winfo_children():
                if hasattr(w, '_is_batch_btn'):
                    w.configure(state="normal" if count > 0 else "disabled")
            return

        # 创建操作栏
        self._select_bar = ctk.CTkFrame(
            self._parent, height=44, corner_radius=0,
            fg_color=t["bg_toolbar"], border_width=1, border_color=t["border"])
        self._select_bar.pack(side="bottom", fill="x", before=self._parent.winfo_children()[0])
        self._select_bar.pack_propagate(False)

        lbl = ctk.CTkLabel(self._select_bar, text=f"已选 {count} 项",
                           font=font(12), text_color=t["text_main"])
        lbl._is_count_label = True
        lbl.pack(side="left", padx=12)

        # 全选
        def do_select_all():
            if self._video_list:
                self._video_list.select_all()
            elif self._video_grid:
                self._video_grid.select_all()

        btn_all = ctk.CTkButton(self._select_bar, text="全选", width=60, height=28,
                                fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                                font=font(11), command=do_select_all)
        btn_all.pack(side="left", padx=(0, 4), pady=8)

        # 取消选择
        def do_deselect():
            if self._video_list:
                self._video_list.deselect_all()
            elif self._video_grid:
                self._video_grid.deselect_all()

        ctk.CTkButton(self._select_bar, text="取消", width=60, height=28,
                      fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                      font=font(11), command=do_deselect
                      ).pack(side="left", padx=(0, 8), pady=8)

        # 标记已看
        def mark_watched():
            paths = self._get_video_selected()
            for fp in paths:
                self._dm.mark_watched(fp, self._folder_path)
            self._dm.save()
            show_toast(self._app_win, f"✓ {len(paths)} 个文件已标记为已看")
            self._exit_video_select()

        btn_w = ctk.CTkButton(self._select_bar, text="✓ 标记已看", width=90, height=28,
                              fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                              font=font(11), command=mark_watched)
        btn_w._is_batch_btn = True
        btn_w.pack(side="left", padx=4, pady=8)

        # 标记未看
        def mark_unwatched():
            paths = self._get_video_selected()
            for fp in paths:
                watched = self._dm.data["watched"].get(self._folder_path, [])
                if fp in watched:
                    watched.remove(fp)
            self._dm.save()
            show_toast(self._app_win, f"✓ {len(paths)} 个文件已标记为未看")
            self._exit_video_select()

        btn_uw = ctk.CTkButton(self._select_bar, text="✗ 标记未看", width=90, height=28,
                               fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                               font=font(11), command=mark_unwatched)
        btn_uw._is_batch_btn = True
        btn_uw.pack(side="left", padx=4, pady=8)

        # 完成按钮
        def finish():
            self._exit_video_select()

        ctk.CTkButton(self._select_bar, text="完成", width=60, height=28,
                      fg_color=t["accent"], hover_color=t["btn_hover"],
                      font=font(11, "bold"), command=finish
                      ).pack(side="right", padx=12, pady=8)

    def _hide_select_bar(self):
        if self._select_bar and self._select_bar.winfo_exists():
            self._select_bar.destroy()
        self._select_bar = None

    def _get_video_selected(self) -> list[str]:
        if self._video_list:
            return self._video_list.get_selected()
        elif self._video_grid:
            return self._video_grid.get_selected()
        return []

    def _enter_video_select(self):
        """右键菜单 → 多选 → 进入选择模式"""
        if self._video_list:
            self._video_list.enter_select_mode()
        elif self._video_grid:
            self._video_grid.enter_select_mode()

    def _exit_video_select(self):
        """退出视频多选模式"""
        if self._video_list:
            self._video_list.exit_select_mode()
        elif self._video_grid:
            self._video_grid.exit_select_mode()
        self._hide_select_bar()

    # ── 后台时长扫描 ──────────────────────────────────
    def _start_duration_scan(self):
        """后台扫描当前文件夹中未缓存时长的视频"""
        if self._scanning_durations:
            return
        to_scan = []
        for v in self._videos:
            fp = np(os.path.join(self._folder_path, v))
            dur = self._dm.get_duration(fp)
            if dur is None or dur == -1:
                to_scan.append(fp)
        if not to_scan:
            return

        self._scanning_durations = True
        log.info(f"duration scan: {len(to_scan)} files in current folder")

        def run():
            scanned = 0
            for fp in to_scan:
                dur = get_video_duration(fp)
                self._dm.set_duration(fp, dur if dur is not None else -1)
                scanned += 1
                log.info(f"scanned ({scanned}/{len(to_scan)}): {os.path.basename(fp)[:50]}... = {dur}")
            self._scanning_durations = False
            self._dm.flush()
            log.info(f"duration scan done: {scanned} files")
            if scanned > 0:
                self._parent.after(0, self._refresh_content)

        threading.Thread(target=run, daemon=True).start()

    # ── 顶部详情栏 ────────────────────────────────────
    def _render_header(self):
        t = tc()
        folder_path = self._folder_path
        meta        = self._meta

        raw_name = get_display_name(folder_path, meta)
        if meta.name:
            display_name = raw_name
        elif self._clean_display:
            display_name = clean_search_keyword(os.path.basename(folder_path))
        else:
            display_name = raw_name

        watched_list = self._dm.data["watched"].get(folder_path, [])

        top   = ctk.CTkFrame(self._parent, corner_radius=0, fg_color=t["bg_detail"])
        top.pack(fill="x")
        inner = ctk.CTkFrame(top, fg_color="transparent")
        inner.pack(fill="x", padx=20, pady=16)

        lbl_cover = ctk.CTkLabel(inner, text="", width=130, height=185)
        lbl_cover.pack(side="left", padx=(0,20))

        def _on_cover_ready(img, lbl=lbl_cover):
            try:
                if lbl.winfo_exists():
                    lbl.configure(image=img)
                    self._refs.append(img)
            except Exception:
                pass

        img = get_cover_ctk(folder_path, meta.cover or "", 130, 185,
                            on_ready=_on_cover_ready, root_widget=lbl_cover)
        self._refs.append(img)
        lbl_cover.configure(image=img)

        info = ctk.CTkFrame(inner, fg_color="transparent")
        info.pack(side="left", fill="both", expand=True)

        # ── 名称行 ──
        name_row = ctk.CTkFrame(info, fg_color="transparent")
        name_row.pack(fill="x", anchor="w")
        ctk.CTkLabel(name_row, text=display_name,
                     font=font(20,"bold"), anchor="w",
                     text_color=t["text_main"],
                     wraplength=440).pack(side="left", anchor="w")

        # 外部链接
        if meta.link:
            ctk.CTkButton(name_row, text="🔗", width=36, height=28,
                          fg_color=t["btn"], hover_color=t["btn_hover"],
                          font=font(14),
                          command=partial(webbrowser.open, meta.link)
                          ).pack(side="right", padx=(4,0))

        # 「···」菜单
        btn_more = ctk.CTkButton(name_row, text="···", width=36, height=28,
                                  fg_color="transparent", hover_color=t["hover"],
                                  text_color=t["text_main"], font=font(16),
                                  command=lambda: MoreMenu(
                                      self._app_win, btn_more,
                                      folder_path, display_name,
                                      self._dm,
                                      partial(self._refresh_content),
                                      self._app_win,
                                      partial(self._on_edit, folder_path)
                                  ))
        btn_more.pack(side="right", padx=(4,0))

        # 视图切换按钮在 _render_content() 中创建（放在"📺 视频文件"标题行右侧）
        self._btn_view = None

        # ── 评分 + 备注 ──
        parts = []
        if meta.rating: parts.append(f"⭐ {meta.rating}/10")
        if meta.note:   parts.append(f"💬 {meta.note}")
        if parts:
            ctk.CTkLabel(info, text="  |  ".join(parts), font=font(12),
                         text_color=t["text_muted"], anchor="w").pack(anchor="w", pady=(2,0))

        # ── 集数统计 ──
        stat_parts = []
        if self._videos:
            wc = len([v for v in self._videos
                      if np(os.path.join(folder_path,v)) in watched_list])
            stat_parts.append(f"📺 {wc}/{len(self._videos)} 集已看")
        if self._subdirs:
            stat_parts.append(f"📂 {len(self._subdirs)} 个子文件夹")
        if stat_parts:
            ctk.CTkLabel(info,
                         text="  ·  ".join(stat_parts),
                         font=font(13), text_color=t["text_muted"], anchor="w"
                         ).pack(anchor="w", pady=(4, 0))

        # ── 简介（更大区域可滚动）──
        desc = meta.desc
        if desc:
            desc_box = ctk.CTkTextbox(info, height=100, font=font(12),
                                      fg_color=t["desc_bg"], border_width=0,
                                      wrap="word", activate_scrollbars=False)
            desc_box.insert("1.0", desc)
            desc_box.configure(state="disabled")  # 只读
            desc_box.pack(anchor="w", fill="x", pady=(6, 0))
        else:
            ctk.CTkLabel(info,
                         text="暂无简介  —  点右上角 ··· 可编辑",
                         font=font(12), text_color=t["empty_text"],
                         anchor="w").pack(anchor="w", pady=(6, 0))

        # ── 播放按钮 ──
        if self._videos:
            unwatched = [v for v in self._videos
                        if np(os.path.join(folder_path,v)) not in watched_list]
            if unwatched:
                ep      = unwatched[0]
                ep_path = np(os.path.join(folder_path, ep))
                label   = f"▶  继续看：{ep}"
            else:
                ep_path = np(os.path.join(folder_path, self._videos[0]))
                label   = "🔁  重新看"
            ctk.CTkButton(info, text=label, height=34,
                          fg_color=t["btn"], hover_color=t["btn_hover"],
                          anchor="w", font=font(12),
                          command=partial(self._open_video_direct, ep_path,
                                         folder_path, list(self._videos))
                          ).pack(anchor="w", pady=(8,0), fill="x")

    # ── 内容区 ────────────────────────────────────────
    def _render_content(self):
        t = tc()
        folder_path = self._folder_path
        meta        = self._meta

        scroll = SmoothScrollFrame(self._parent, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        # ── 视频文件（放在上面）──
        if self._videos:
            view_mode = meta.video_view_mode or "list"

            # 视频区标题行：左侧标题 + 右侧列表/宫格切换按钮
            vid_hdr = ctk.CTkFrame(scroll.content, fg_color="transparent")
            vid_hdr.pack(fill="x", pady=(0, 6))
            ctk.CTkLabel(vid_hdr, text="📺 视频文件",
                         font=font(13, "bold"),
                         text_color=t["text_dim"], anchor="w"
                         ).pack(side="left")
            self._btn_view = ctk.CTkButton(
                vid_hdr,
                text="🔲" if view_mode == "list" else "📋",
                width=36, height=26,
                fg_color=t["btn_toggle_a"] if view_mode == "list" else t["btn_toggle_b"],
                hover_color=t["hover"], font=font(13),
                text_color="#ffffff",
                command=self._toggle_view)
            self._btn_view.pack(side="right")

            if view_mode == "list":
                vl = VideoList(None, self._dm, folder_path,
                               list(self._videos),
                               on_open=partial(self._open_video_mark,
                                              folder_path=folder_path),
                               app_win=self._app_win)
                vl.set_selection_callback(self._show_select_bar)
                vl.set_enter_select_callback(self._enter_video_select)
                self._video_list = vl

                vl.render_controls(scroll.content)
                vl_frame = ctk.CTkFrame(scroll.content, fg_color="transparent")
                vl_frame.pack(fill="both", expand=True)
                vl._container = vl_frame
                vl._first_render = True
                vl.refresh()
            else:
                vl_frame = ctk.CTkFrame(scroll.content, fg_color="transparent")
                vl_frame.pack(fill="x")
                sort_var = ctk.StringVar(value="文件名升序")
                ctrl = ctk.CTkFrame(scroll.content, fg_color="transparent")
                ctrl.pack(fill="x", anchor="w", pady=(0, 4))
                ctk.CTkLabel(ctrl, text="排序：", font=font(12)
                             ).pack(side="left")
                ctk.CTkOptionMenu(ctrl, variable=sort_var,
                                  values=["文件名升序", "文件名降序"],
                                  width=130, height=28, font=font(12),
                                  command=lambda _: self._refresh_content()
                                  ).pack(side="left", padx=4)

                vg = VideoGrid(vl_frame, self._dm, folder_path,
                               list(self._videos), self._refs,
                               on_open=self._open_video_grid,
                               app_win=self._app_win)
                vg.set_selection_callback(self._show_select_bar)
                vg.set_enter_select_callback(self._enter_video_select)
                self._video_grid = vg
                vg.render(sort_desc=("降序" in sort_var.get()))

        # ── 子文件夹（放在视频下面）──
        if self._subdirs:
            if self._videos:
                sep = ctk.CTkFrame(scroll.content, height=1,
                                   fg_color=t["sep_color"])
                sep.pack(fill="x", pady=(16, 12))

            sh = ctk.CTkFrame(scroll.content, fg_color="transparent")
            sh.pack(fill="x", pady=(0, 8))
            ctk.CTkLabel(sh, text="📂 子文件夹", font=font(13, "bold"),
                         text_color=t["text_dim"]).pack(side="left")
            sl = next((l for l,k in SORT_OPTIONS
                       if k==self._dm.data.get("sort_key","name")), "排序")
            sl += " ↓" if self._dm.data.get("sort_desc") else " ↑"
            btn_s = ctk.CTkButton(sh, text=f"↕  {sl}", width=160, height=26,
                                   fg_color=t["btn_toggle_a"], hover_color=t["hover"],
                                   text_color="#ffffff", font=font(11),
                                   command=lambda: SortMenu(
                                       self._app_win, btn_s, self._dm,
                                       partial(self._refresh_content)))
            btn_s.pack(side="right")
            self._render_grid(scroll.content, folder_path, list(self._subdirs))

    # ── 视图切换 ──────────────────────────────────────
    def _toggle_view(self):
        """切换列表/宫格模式"""
        t = tc()
        meta = self._meta
        new_mode = "grid" if (meta.video_view_mode or "list") != "grid" else "list"
        meta.video_view_mode = new_mode
        self._dm.set_meta(self._folder_path, meta)
        # 直接更新按钮外观，不闪屏
        if self._btn_view:
            self._btn_view.configure(
                text="🔲" if new_mode == "list" else "📋",
                fg_color=t["btn_toggle_a"] if new_mode == "list" else t["btn_toggle_b"],
                text_color="#ffffff")
        self._refresh_content()

    # ── 视频操作 ──────────────────────────────────────
    def _open_video_mark(self, file_path: str, folder_path: str):
        self._on_open_video(file_path, folder_path)

    def _open_video_direct(self, fp, folder_path, videos):
        self._on_open_video(fp, folder_path)
        self._refresh_content()

    def _open_video_grid(self, file_path: str, folder_path: str):
        self._on_open_video(file_path, folder_path)
