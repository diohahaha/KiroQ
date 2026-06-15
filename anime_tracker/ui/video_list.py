"""视频列表渲染（右键菜单 + 时长显示）— 行复用版

refresh() 不复建 Widget，只更新文字/颜色/已看徽标状态。
多选功能已移除，统一改为右键菜单操作。
"""
import os
from functools import partial
import customtkinter as ctk
from utils import font, Tooltip
from config import tc
from core.data_manager import np, natural_key


def _fmt_dur(sec: float) -> str:
    """秒 → MM:SS 或 H:MM:SS"""
    sec = int(sec)
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


class VideoList:
    def __init__(self, container, dm, folder_path: str,
                 videos: list[str], on_open, app_win=None):
        self._container   = container
        self._dm          = dm
        self._folder_path = np(folder_path)
        self._videos      = videos
        self._on_open     = on_open
        self._app_win     = app_win
        self._sort_var    = ctk.StringVar(value="文件名升序")
        # 行缓存：fp → {row, lbl, lbl_w, bg}
        self._row_cache: dict[str, dict] = {}
        self._first_render = True

    # ── 排序栏（仅保留排序，无多选按钮）────────────────
    def render_controls(self, parent):
        ctrl = ctk.CTkFrame(parent, fg_color="transparent")
        ctrl.pack(fill="x", anchor="w", pady=(0, 4))

        ctk.CTkLabel(ctrl, text="排序：", font=font(12)).pack(side="left")
        ctk.CTkOptionMenu(ctrl, variable=self._sort_var,
                          values=["文件名升序", "文件名降序"],
                          width=130, height=28, font=font(12),
                          command=lambda _: self.refresh()).pack(side="left", padx=4)
        return self._sort_var

    # ── 刷新（复用行容器）────────────────────────────────
    def refresh(self):
        t = tc()
        watched_set = set(self._dm.data["watched"].get(self._folder_path, []))
        asc = "升序" in self._sort_var.get()
        videos = sorted(self._videos, key=natural_key, reverse=not asc)
        fps_ordered = [np(os.path.join(self._folder_path, v)) for v in videos]

        # 首次渲染：全量创建
        if self._first_render:
            for w in self._container.winfo_children():
                w.destroy()
            self._row_cache.clear()
            for i, (fname, fp) in enumerate(zip(videos, fps_ordered)):
                is_w = fp in watched_set
                bg = t["row_even"] if i % 2 == 0 else t["row_odd"]
                self._mk_row(fname, fp, i, is_w, bg, t)
            self._first_render = False
            return

        # 后续刷新：只更新已有行状态
        for i, (fname, fp) in enumerate(zip(videos, fps_ordered)):
            is_w = fp in watched_set
            bg = t["row_even"] if i % 2 == 0 else t["row_odd"]

            c = self._row_cache.get(fp)
            if c is None or not c["row"].winfo_exists():
                self._mk_row(fname, fp, i, is_w, bg, t)
                continue

            c["row"].configure(fg_color=bg)
            c["bg"] = bg
            c["lbl"].configure(
                text_color=t["unwatched_text"] if is_w else t["text_main"])

            if is_w:
                if not c["lbl_w"].winfo_ismapped():
                    c["lbl_w"].pack(side="right", padx=(0, 6))
            else:
                if c["lbl_w"].winfo_ismapped():
                    c["lbl_w"].pack_forget()

            c["row"].pack(fill="x", pady=2)

    def _mk_row(self, fname: str, fp: str, idx: int,
                is_w: bool, bg: str, t: dict):
        """创建一行并写入缓存"""
        row = ctk.CTkFrame(self._container, height=42, corner_radius=6, fg_color=bg)
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        # ── 时长（最右侧，先 pack 占位）──
        dur = self._dm.get_duration(fp)
        if dur and dur > 0:
            ctk.CTkLabel(row, text=_fmt_dur(dur),
                         font=font(10), text_color=t["text_dim"],
                         width=55, anchor="e"
                         ).pack(side="right", padx=(0, 8))

        # ── 已看标记（时长左边）──
        lbl_w = ctk.CTkLabel(row, text="✓ 看",
                             font=font(10), text_color=t["watched_text"],
                             width=38)
        if is_w:
            lbl_w.pack(side="right", padx=(0, 4))

        # ── 文件名（填满剩余宽度）──
        lbl = ctk.CTkLabel(row, text=fname, font=font(12),
                           text_color=t["unwatched_text"] if is_w else t["text_main"],
                           anchor="w")
        lbl.pack(side="left", fill="x", expand=True, padx=(10, 0))
        Tooltip(lbl, fname)

        # ── 事件绑定 ──
        open_fn   = partial(self._open, fp)
        rclick_fn = partial(self._rclick, fp, fname)
        for w in (row, lbl):
            w.bind("<Double-Button-1>", lambda e, f=open_fn: f())
            w.bind("<Button-3>", rclick_fn)
            w.bind("<Enter>",
                   lambda e, r=row: r.configure(fg_color=t["row_hover"]))
            w.bind("<Leave>",
                   lambda e, r=row: r.configure(
                       fg_color=self._row_cache.get(fp, {}).get("bg", bg)))

        self._row_cache[fp] = {"row": row, "lbl": lbl, "lbl_w": lbl_w, "bg": bg}

    # ── 打开 / 右键 ─────────────────────────────────────
    def _open(self, full_path: str):
        self._on_open(full_path)
        self.refresh()

    def _rclick(self, full_path: str, fname: str, event):
        from ui.menus import VideoContextMenu
        VideoContextMenu(self._app_win or self._container.winfo_toplevel(),
                         event, [full_path], self._folder_path,
                         self._dm, self.refresh, self._app_win)
