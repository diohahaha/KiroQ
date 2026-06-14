"""文件夹详情页"""
import os, webbrowser
from functools import partial
import customtkinter as ctk
from utils import font, get_cover_ctk, clean_search_keyword
from config import SORT_OPTIONS, tc
from core.data_manager import get_display_name, scan_folder, np
from ui.video_list import VideoList
from ui.video_grid import VideoGrid
from ui.menus import SortMenu, MoreMenu
from ui.smooth_scroll import SmoothScrollFrame


class DetailPage:
    def __init__(self, parent, dm, image_refs: list,
                 on_enter_folder, on_open_video,
                 on_edit_meta, app_win,
                 render_grid_fn):
        self._parent        = parent
        self._dm            = dm
        self._refs          = image_refs
        self._on_enter      = on_enter_folder
        self._on_open_video = on_open_video
        self._on_edit       = on_edit_meta
        self._app_win       = app_win
        self._render_grid   = render_grid_fn

    # ── 主渲染入口 ────────────────────────────────────
    def render(self, folder_path: str, clean_display: bool = False):
        self._clean_display = clean_display
        self._folder_path   = np(folder_path)
        self._meta          = self._dm.get_meta(self._folder_path)
        self._subdirs, self._videos = scan_folder(self._folder_path)
        self._render_full()

    def _render_full(self):
        """完整渲染（首次进入时调用）"""
        for w in self._parent.winfo_children():
            w.destroy()
        self._render_header()
        self._render_content()

    def _refresh_content(self):
        """仅刷新内容区（切换视图/排序时调用，不闪屏）"""
        # 找到并销毁 scroll 区域（第二个子控件，第一个是 top bar）
        children = self._parent.winfo_children()
        for w in children[1:]:
            w.destroy()
        self._render_content()

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

        img = get_cover_ctk(folder_path, meta.cover or "", 130, 185)
        self._refs.append(img)
        ctk.CTkLabel(inner, image=img, text="").pack(side="left", padx=(0,20))

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

        # 视图切换（仅当有视频时显示）
        self._btn_view = None
        if self._videos:
            view_mode = meta.video_view_mode or "list"
            self._btn_view = ctk.CTkButton(name_row,
                text="🔲" if view_mode == "list" else "📋",
                width=36, height=28,
                fg_color=t["btn_toggle_a"] if view_mode == "list" else t["btn_toggle_b"],
                hover_color=t["hover"], font=font(14),
                command=self._toggle_view)
            self._btn_view.pack(side="right", padx=(4,0))

        # 「···」菜单
        btn_more = ctk.CTkButton(name_row, text="···", width=36, height=28,
                                  fg_color="transparent", hover_color=t["hover"],
                                  font=font(16),
                                  command=lambda: MoreMenu(
                                      self._app_win, btn_more,
                                      folder_path, display_name,
                                      self._dm,
                                      partial(self._refresh_content),
                                      self._app_win,
                                      partial(self._on_edit, folder_path)
                                  ))
        btn_more.pack(side="right", padx=(4,0))

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

            ctk.CTkLabel(scroll.content, text="📺 视频文件",
                         font=font(13, "bold"),
                         text_color=t["text_dim"], anchor="w"
                         ).pack(anchor="w", pady=(0, 6))

            if view_mode == "list":
                vl = VideoList(None, self._dm, folder_path,
                               list(self._videos),
                               on_open=partial(self._open_video_mark,
                                              folder_path=folder_path),
                               app_win=self._app_win)
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
                                   font=font(11),
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
                fg_color=t["btn_toggle_a"] if new_mode == "list" else t["btn_toggle_b"])
        self._refresh_content()

    # ── 视频操作 ──────────────────────────────────────
    def _open_video_mark(self, file_path: str, folder_path: str):
        self._on_open_video(file_path, folder_path)

    def _open_video_direct(self, fp, folder_path, videos):
        self._on_open_video(fp, folder_path)
        self._refresh_content()

    def _open_video_grid(self, file_path: str, folder_path: str):
        self._on_open_video(file_path, folder_path)
