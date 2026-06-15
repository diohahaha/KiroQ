"""视频文件宫格卡片渲染（自适应列数 + 时长叠加 + 文件名换行）"""
import os
from functools import partial
import customtkinter as ctk
from config import (VIDEO_CARD_W, VIDEO_THUMB_W, VIDEO_THUMB_H, tc)
from utils import font, Tooltip, get_video_thumb_ctk
from core.data_manager import np, natural_key


def _fmt_dur(sec: float) -> str:
    """秒 → MM:SS 或 H:MM:SS"""
    sec = int(sec)
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


class VideoGrid:
    """视频文件宫格（自适应列数，与 AnimeGrid 相同策略）"""

    def __init__(self, parent, dm, folder_path: str,
                 videos: list[str], image_refs: list,
                 on_open, app_win=None):
        self._parent        = parent
        self._dm            = dm
        self._folder_path   = folder_path
        self._videos        = videos
        self._refs          = image_refs
        self._on_open       = on_open
        self._app_win       = app_win

        self._sort_desc  = False
        self._rendering  = False
        self._resize_job = None
        self._last_w     = 0

        # 绑定父容器宽度变化，自动重排列数（防抖 200ms）
        self._parent.bind("<Configure>", self._on_resize, add="+")

    # ── 公共入口 ──────────────────────────────────────
    def render(self, sort_desc: bool = False):
        self._sort_desc = sort_desc
        # 立即屏蔽 resize，防止 after_idle 前产生竞态
        self._rendering = True
        if self._resize_job:
            try: self._parent.after_cancel(self._resize_job)
            except Exception: pass
            self._resize_job = None
        self._parent.after_idle(self._do_render)

    # ── 响应父容器宽度变化 ────────────────────────────
    def _on_resize(self, event):
        if self._rendering:
            return
        try:
            new_w = self._parent.winfo_width()
        except Exception:
            return
        if new_w < 10 or new_w == self._last_w:
            return
        self._last_w = new_w
        if self._resize_job:
            try: self._parent.after_cancel(self._resize_job)
            except Exception: pass
        self._resize_job = self._parent.after(200, self._do_render)

    # ── 实际渲染 ──────────────────────────────────────
    def _do_render(self):
        self._resize_job = None
        self._rendering  = True
        t = tc()

        try:
            if not self._parent.winfo_exists():
                self._rendering = False
                return
        except Exception:
            self._rendering = False
            return

        # 清除旧内容
        for w in self._parent.winfo_children():
            w.destroy()

        if not self._videos:
            ctk.CTkLabel(self._parent, text="暂无视频文件",
                         font=font(12), text_color=t["text_dim"]).pack(pady=20)
            self._rendering = False
            return

        videos = sorted(self._videos, key=natural_key, reverse=self._sort_desc)

        # 获取父容器真实宽度（必须调用 update_idletasks，原因同 AnimeGrid）
        self._parent.update_idletasks()
        parent_w = self._parent.winfo_width()
        if parent_w < 100:
            parent_w = 800
        self._last_w = parent_w

        # 自适应列数：与 AnimeGrid 相同策略（GAP_MIN=8 留边距）
        col_count = max(1, (parent_w - 24) // (VIDEO_CARD_W + 12))

        grid_frame = ctk.CTkFrame(self._parent, fg_color="transparent")
        grid_frame.pack(fill="x", anchor="w")

        watched_list = self._dm.data["watched"].get(self._folder_path, [])

        for vis_i, v in enumerate(videos):
            full_path = np(os.path.join(self._folder_path, v))
            is_watched = full_path in watched_list
            row_i, col_i = divmod(vis_i, col_count)

            # 卡片：只固定宽度，高度随内容自动延伸（grid sticky="n" 保证行对齐）
            card = ctk.CTkFrame(grid_frame,
                                width=VIDEO_CARD_W,
                                corner_radius=10,
                                fg_color=t["bg_card"],
                                border_width=1, border_color=t["border"])
            card.grid(row=row_i, column=col_i, padx=6, pady=6, sticky="n")

            # ── 缩略图容器（固定尺寸，用于叠加时长标签）──
            thumb_frame = ctk.CTkFrame(card,
                                       width=VIDEO_THUMB_W, height=VIDEO_THUMB_H,
                                       fg_color="transparent", corner_radius=0)
            thumb_frame.pack(padx=0, pady=0)
            thumb_frame.pack_propagate(False)

            thumb_label = ctk.CTkLabel(thumb_frame, text="")
            thumb_label.place(relx=0, rely=0, relwidth=1, relheight=1)

            def _on_thumb_ready(new_img, lbl=thumb_label, refs=self._refs):
                try:
                    if lbl.winfo_exists():
                        lbl.configure(image=new_img)
                        refs.append(new_img)
                except Exception:
                    pass

            thumb_img = get_video_thumb_ctk(
                full_path, VIDEO_THUMB_W, VIDEO_THUMB_H,
                on_ready=_on_thumb_ready, root_widget=thumb_frame)
            self._refs.append(thumb_img)
            thumb_label.configure(image=thumb_img)

            # ── 时长叠加（右下角半透明标签）──
            dur = self._dm.get_duration(full_path)
            if dur and dur > 0:
                ctk.CTkLabel(
                    thumb_frame,
                    text=_fmt_dur(dur),
                    font=font(9),
                    fg_color="#111111",
                    text_color="#eeeeee",
                    corner_radius=3,
                    padx=4, pady=1
                ).place(relx=1.0, rely=1.0, anchor="se", x=-4, y=-4)

            # ── 已看标记（紧贴缩略图下方）──
            if is_watched:
                ctk.CTkLabel(card, text="✓ 已看", font=font(9),
                             fg_color=t["watched_bg"], corner_radius=0,
                             text_color=t["watched_fg"]).pack(fill="x")

            # ── 文件名（换行显示，不截断）──
            ctk.CTkLabel(card, text=v,
                         font=font(11, "bold"),
                         text_color=t["text_main"],
                         wraplength=VIDEO_CARD_W - 12,
                         justify="left"
                         ).pack(padx=6, pady=(4, 6), anchor="w")

            # ── 事件绑定 ──
            tip = v + ("\n(已观看)" if is_watched else "")
            for w in (card, thumb_frame, thumb_label):
                try:
                    Tooltip(w, tip)
                    w.bind("<Double-Button-1>", partial(self._open, full_path))
                    w.bind("<Button-3>",        partial(self._rclick, full_path, v))
                    w.bind("<Enter>",           partial(self._hover, card, True))
                    w.bind("<Leave>",           partial(self._hover, card, False))
                except Exception:
                    pass

        for c in range(col_count):
            grid_frame.grid_columnconfigure(c, weight=1)

        self._rendering = False

    # ── 右键 / 打开 / 悬停 ────────────────────────────
    def _rclick(self, full_path: str, fname: str, event):
        from ui.menus import VideoContextMenu
        VideoContextMenu(self._app_win or self._parent.winfo_toplevel(),
                         event, [full_path], self._folder_path,
                         self._dm, self._do_render, self._app_win)

    def _open(self, path, event=None):
        self._on_open(path, self._folder_path)
        self._do_render()

    def _hover(self, card, entering, event=None):
        t = tc()
        try:
            card.configure(border_color=t["border_hover"] if entering else t["border"])
        except Exception:
            pass
