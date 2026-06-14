"""视频文件宫格卡片渲染"""
import os
from functools import partial
import customtkinter as ctk
from config import (VIDEO_CARD_W, VIDEO_CARD_H, VIDEO_THUMB_W, VIDEO_THUMB_H, tc)
from utils import font, Tooltip, get_video_thumb_ctk
from core.data_manager import np, natural_key


class VideoGrid:
    """把视频文件渲染成宫格卡片"""

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

    def render(self, sort_desc: bool = False):
        """渲染宫格"""
        t = tc()
        # 清除旧内容
        for w in self._parent.winfo_children():
            w.destroy()

        if not self._videos:
            ctk.CTkLabel(self._parent, text="暂无视频文件",
                         font=font(12), text_color=t["text_dim"]).pack(pady=20)
            return

        videos = list(self._videos)
        videos.sort(key=natural_key, reverse=sort_desc)

        parent_w = self._parent.winfo_width()
        if parent_w < 100:
            self._parent.update_idletasks()
            parent_w = self._parent.winfo_width()
        if parent_w < 100:
            parent_w = 600  # fallback
        col_count = max(2, (parent_w - 40) // (VIDEO_CARD_W + 12))

        grid_frame = ctk.CTkFrame(self._parent, fg_color="transparent")
        grid_frame.pack(fill="x", anchor="w")

        watched_list = self._dm.data["watched"].get(self._folder_path, [])

        for vis_i, v in enumerate(videos):
            full_path = np(os.path.join(self._folder_path, v))
            is_watched = full_path in watched_list
            row_i, col_i = divmod(vis_i, col_count)

            # 卡片
            card = ctk.CTkFrame(grid_frame,
                                width=VIDEO_CARD_W, height=VIDEO_CARD_H,
                                corner_radius=10,
                                fg_color=t["bg_card"],
                                border_width=1, border_color=t["border"])
            card.grid(row=row_i, column=col_i, padx=6, pady=6, sticky="n")
            card.pack_propagate(False)
            card.grid_propagate(False)

            # 缩略图：先用占位图，后台提取真实缩略图
            thumb_label = ctk.CTkLabel(card, text="")
            thumb_label.pack()

            def _on_thumb_ready(new_img, lbl=thumb_label, refs=self._refs):
                lbl.configure(image=new_img)
                refs.append(new_img)

            thumb_img = get_video_thumb_ctk(
                full_path, VIDEO_THUMB_W, VIDEO_THUMB_H,
                on_ready=_on_thumb_ready, root_widget=card)

            self._refs.append(thumb_img)
            thumb_label.configure(image=thumb_img)

            # 已看标记
            if is_watched:
                ctk.CTkLabel(card, text="✓ 已看", font=font(9),
                             fg_color=t["watched_bg"], corner_radius=0,
                             text_color=t["watched_fg"]).pack(fill="x")

            # 文件名
            short = v if len(v) <= 22 else v[:20] + "…"
            lbl_name = ctk.CTkLabel(card, text=short,
                                    font=font(11, "bold"),
                                    text_color=t["text_main"],
                                    wraplength=VIDEO_CARD_W - 12)
            lbl_name.pack(padx=6, pady=(4, 2))

            # 文件信息提示
            tip = v
            if is_watched:
                tip += "\n(已观看)"

            # 事件绑定
            for w in (card, thumb_label, lbl_name):
                Tooltip(w, tip)
                w.bind("<Double-Button-1>", partial(self._open, full_path))
                w.bind("<Button-3>", partial(self._rclick, full_path, v))
                w.bind("<Enter>", partial(self._hover, card, True))
                w.bind("<Leave>", partial(self._hover, card, False))

        for c in range(col_count):
            grid_frame.grid_columnconfigure(c, weight=1)

    def _rclick(self, full_path: str, fname: str, event):
        from ui.menus import VideoContextMenu
        VideoContextMenu(self._app_win or self._parent.winfo_toplevel(),
                         event, [full_path], self._folder_path,
                         self._dm, self.render, self._app_win)

    def _open(self, path, event=None):
        self._on_open(path, self._folder_path)
        self.render()  # 刷新标记

    def _hover(self, card, entering, event=None):
        t = tc()
        if entering:
            card.configure(border_color=t["border_hover"])
        else:
            card.configure(border_color=t["border"])
