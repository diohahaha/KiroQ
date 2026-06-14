"""视频列表渲染（支持多选）— 行复用版

refresh() 不复建 Widget，只更新文字/颜色/checkbox 状态。
"""
import os
from functools import partial
import customtkinter as ctk
from utils import font, Tooltip, show_toast
from config import tc
from core.data_manager import np, natural_key


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
        self._selected: set[str] = set()
        self._check_vars: dict[str, ctk.BooleanVar] = {}
        # 行缓存：fp → {row, cb, var, lbl, lbl_w}
        self._row_cache: dict[str, dict] = {}
        self._first_render = True

    def render_controls(self, parent):
        t = tc()
        ctrl = ctk.CTkFrame(parent, fg_color="transparent")
        ctrl.pack(fill="x", anchor="w", pady=(0, 4))

        ctk.CTkLabel(ctrl, text="排序：", font=font(12)).pack(side="left")
        ctk.CTkOptionMenu(ctrl, variable=self._sort_var,
                          values=["文件名升序", "文件名降序"],
                          width=130, height=28, font=font(12),
                          command=lambda _: self.refresh()).pack(side="left", padx=4)

        ctk.CTkButton(ctrl, text="☐ 全选", width=70, height=26,
                      fg_color="transparent", hover_color=t["hover"],
                      font=font(11), command=self._select_all).pack(side="left", padx=(12, 4))
        ctk.CTkButton(ctrl, text="✗ 取消", width=70, height=26,
                      fg_color="transparent", hover_color=t["hover"],
                      font=font(11), command=self._deselect_all).pack(side="left")

        ctk.CTkButton(ctrl, text="✓ 已看", width=70, height=26,
                      fg_color="transparent", hover_color="#1a3a1a",
                      font=font(11), command=self._batch_mark).pack(side="right", padx=(0, 2))
        ctk.CTkButton(ctrl, text="✗ 未看", width=70, height=26,
                      fg_color="transparent", hover_color="#3a1a1a",
                      font=font(11), command=self._batch_unmark).pack(side="right", padx=2)

        return self._sort_var

    # ── 刷新（核心：复用行容器）─────────────────────────
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
            self._check_vars.clear()
            for i, (fname, fp) in enumerate(zip(videos, fps_ordered)):
                is_w = fp in watched_set
                bg = t["row_even"] if i % 2 == 0 else t["row_odd"]
                self._mk_row(fname, fp, i, is_w, bg, t)
            self._first_render = False
            return

        # 后续刷新：只更新已有行
        for i, (fname, fp) in enumerate(zip(videos, fps_ordered)):
            is_w = fp in watched_set
            bg = t["row_even"] if i % 2 == 0 else t["row_odd"]

            c = self._row_cache.get(fp)
            if c is None or not c["row"].winfo_exists():
                self._mk_row(fname, fp, i, is_w, bg, t)
                continue

            # 只改状态，不重建
            c["row"].configure(fg_color=bg)
            c["var"].set(fp in self._selected)
            c["cb"].configure(
                fg_color=t["cb_checked"] if not is_w else t["cb_unchecked"],
                hover_color=t["cb_hover"])
            c["lbl"].configure(
                text_color=t["unwatched_text"] if is_w else t["text_main"])

            if is_w:
                if not c["lbl_w"].winfo_ismapped():
                    c["lbl_w"].pack(side="right", padx=(0, 10))
            else:
                if c["lbl_w"].winfo_ismapped():
                    c["lbl_w"].pack_forget()

            # pack 顺序确保排序生效
            c["row"].pack(fill="x", pady=2)

    def _mk_row(self, fname: str, fp: str, idx: int,
                is_w: bool, bg: str, t: dict):
        """创建一行并写入缓存"""
        row = ctk.CTkFrame(self._container, height=42, corner_radius=6, fg_color=bg)
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        var = ctk.BooleanVar(value=fp in self._selected)
        self._check_vars[fp] = var
        cb = ctk.CTkCheckBox(row, text="", variable=var,
                             width=22, height=22, checkbox_width=16, checkbox_height=16,
                             border_width=1, corner_radius=3,
                             fg_color=t["cb_checked"] if not is_w else t["cb_unchecked"],
                             hover_color=t["cb_hover"],
                             command=partial(self._toggle_select, fp))
        cb.pack(side="left", padx=(8, 4))

        df = fname if len(fname) <= 58 else fname[:56] + "…"
        lbl = ctk.CTkLabel(row, text=df, font=font(12),
                           text_color=t["unwatched_text"] if is_w else t["text_main"],
                           anchor="w")
        lbl.pack(side="left", fill="x", expand=True, padx=(2, 0))
        if len(fname) > 58:
            Tooltip(lbl, fname)

        lbl_w = ctk.CTkLabel(row, text="已看", font=font(10),
                             text_color=t["watched_text"], width=36)
        if is_w:
            lbl_w.pack(side="right", padx=(0, 10))

        open_fn = partial(self._open, fp)
        rclick_fn = partial(self._rclick, fp, fname)
        for w in (row, lbl):
            w.bind("<Double-Button-1>", lambda e, f=open_fn: f())
            w.bind("<Button-3>", rclick_fn)
            w.bind("<Enter>",  lambda e, r=row: r.configure(fg_color=t["row_hover"]))
            w.bind("<Leave>",  lambda e, r=row, b=bg: r.configure(fg_color=b))

        self._row_cache[fp] = {"row": row, "cb": cb, "var": var,
                               "lbl": lbl, "lbl_w": lbl_w}

    # ── 选择 ────────────────────────────────────────────
    def _toggle_select(self, fp: str):
        if fp in self._selected:
            self._selected.discard(fp)
        else:
            self._selected.add(fp)

    def _select_all(self):
        for fp, var in self._check_vars.items():
            var.set(True)
            self._selected.add(fp)

    def _deselect_all(self):
        for fp, var in self._check_vars.items():
            var.set(False)
        self._selected.clear()

    # ── 批量操作 ────────────────────────────────────────
    def _batch_mark(self):
        targets = list(self._selected) if self._selected else \
                  [np(os.path.join(self._folder_path, v)) for v in self._videos]
        for fp in targets:
            self._dm.mark_watched(fp, self._folder_path)
        if self._app_win:
            show_toast(self._app_win, f"✓ 已标记 {len(targets)} 个为已看")
        self.refresh()

    def _batch_unmark(self):
        watched = self._dm.data["watched"].get(self._folder_path, [])
        targets = list(self._selected) if self._selected else list(watched)
        for fp in targets:
            if fp in watched:
                watched.remove(fp)
        self._dm.save()
        if self._app_win:
            show_toast(self._app_win, f"✓ 已标记 {len(targets)} 个为未看")
        self.refresh()

    # ── 打开 / 右键 ────────────────────────────────────
    def _open(self, full_path: str):
        self._on_open(full_path)
        self.refresh()

    def _rclick(self, full_path: str, fname: str, event):
        from ui.menus import VideoContextMenu
        selected = list(self._selected) \
            if self._selected and full_path in self._selected else [full_path]
        VideoContextMenu(self._app_win or self._container.winfo_toplevel(),
                         event, selected, self._folder_path,
                         self._dm, self.refresh, self._app_win)
