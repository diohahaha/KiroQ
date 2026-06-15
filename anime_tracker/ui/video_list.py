"""视频列表渲染（右键菜单 + 时长显示）— 行复用版

refresh() 不复建 Widget，只更新文字/颜色/已看徽标状态。
支持多选模式：默认行前显示 ● 装饰圆点，进入多选后变为方框勾选。
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


def _blend_hex(hex1: str, hex2: str, ratio: float) -> str:
    """混合两个 hex 颜色，ratio=0→hex1，ratio=1→hex2"""
    r1, g1, b1 = int(hex1[1:3], 16), int(hex1[3:5], 16), int(hex1[5:7], 16)
    r2, g2, b2 = int(hex2[1:3], 16), int(hex2[3:5], 16), int(hex2[5:7], 16)
    r = int(r1 + (r2 - r1) * ratio)
    g = int(g1 + (g2 - g1) * ratio)
    b = int(b1 + (b2 - b1) * ratio)
    return f"#{r:02x}{g:02x}{b:02x}"


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
        self._row_cache: dict[str, dict] = {}
        self._first_render = True

        # ── 多选状态 ──
        self._select_mode = False
        self._selected_fps: set[str] = set()
        self._on_sel_change = None
        self._on_enter_select_cb = None

    # ── 多选 API ──────────────────────────────────────
    def set_selection_callback(self, cb):
        self._on_sel_change = cb

    def set_enter_select_callback(self, cb):
        self._on_enter_select_cb = cb

    def enter_select_mode(self):
        self._select_mode = True
        self._selected_fps.clear()
        self._update_all_indicators()
        if self._on_sel_change:
            self._on_sel_change(0)

    def exit_select_mode(self):
        self._select_mode = False
        self._selected_fps.clear()
        self._update_all_indicators()
        if self._on_sel_change:
            self._on_sel_change(-1)

    @property
    def in_select_mode(self) -> bool:
        return self._select_mode

    def get_selected(self) -> list[str]:
        return [fp for fp in self._selected_fps
                if fp in self._row_cache and self._row_cache[fp]["row"].winfo_exists()]

    def select_all(self):
        fps = [np(os.path.join(self._folder_path, v)) for v in self._videos]
        self._selected_fps = set(fps)
        self._update_all_indicators()
        if self._on_sel_change:
            self._on_sel_change(len(self._selected_fps))

    def deselect_all(self):
        self._selected_fps.clear()
        self._update_all_indicators()
        if self._on_sel_change:
            self._on_sel_change(0)

    # ── 排序栏 ────────────────────────────────────────
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

        if self._first_render:
            for w in self._container.winfo_children():
                w.destroy()
            self._row_cache.clear()
            for i, (fname, fp) in enumerate(zip(videos, fps_ordered)):
                is_w = fp in watched_set
                is_sel = fp in self._selected_fps
                bg = self._row_bg(i, is_sel, t)
                self._mk_row(fname, fp, i, is_w, is_sel, bg, t)
            self._first_render = False
            return

        for i, (fname, fp) in enumerate(zip(videos, fps_ordered)):
            is_w = fp in watched_set
            is_sel = fp in self._selected_fps
            bg = self._row_bg(i, is_sel, t)

            c = self._row_cache.get(fp)
            if c is None or not c["row"].winfo_exists():
                self._mk_row(fname, fp, i, is_w, is_sel, bg, t)
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

            self._update_indicator_visual(c, is_sel, is_w, t)

            c["row"].pack(fill="x", pady=2)

    def _row_bg(self, idx: int, is_selected: bool, t: dict) -> str:
        if is_selected:
            # 选中=行背景混入 18% 强调色，看得清文字又不刺眼
            base = t["row_even"] if idx % 2 == 0 else t["row_odd"]
            return _blend_hex(base, t["accent"], 0.18)
        return t["row_even"] if idx % 2 == 0 else t["row_odd"]

    def _mk_row(self, fname: str, fp: str, idx: int,
                is_w: bool, is_sel: bool, bg: str, t: dict):
        """创建一行并写入缓存"""
        row = ctk.CTkFrame(self._container, height=42, corner_radius=6, fg_color=bg)
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        # ── 选择指示器（最左侧）──
        ind_w = self._build_indicator(row, is_sel, is_w, t)

        # ── 时长（已看标记左边，右对齐）──
        dur = self._dm.get_duration(fp)
        if dur and dur > 0:
            ctk.CTkLabel(row, text=_fmt_dur(dur),
                         font=font(10), text_color=t["text_dim"],
                         width=55, anchor="e"
                         ).pack(side="right", padx=(0, 4))

        # ── 已看标记（最右侧）──
        lbl_w = ctk.CTkLabel(row, text="✓ 看",
                             font=font(10), text_color=t["watched_text"],
                             width=38)
        if is_w:
            lbl_w.pack(side="right", padx=(0, 8))

        # ── 文件名（填满剩余宽度）──
        lbl = ctk.CTkLabel(row, text=fname, font=font(12),
                           text_color=t["unwatched_text"] if is_w else t["text_main"],
                           anchor="w")
        lbl.pack(side="left", fill="x", expand=True, padx=(6, 0))
        Tooltip(lbl, fname)

        # ── 事件绑定 ──
        open_fn   = partial(self._open, fp)
        rclick_fn = partial(self._rclick, fp, fname)

        if self._select_mode:
            # 选择模式下点击行/指示器 → 切换选中
            for w in (ind_w, row, lbl):
                w.bind("<Button-1>", partial(self._on_indicator_click, fp))
        else:
            ind_w.bind("<Button-1>", lambda e: None)

        for w in (row, lbl):
            w.bind("<Double-Button-1>", lambda e, f=open_fn: f())
            w.bind("<Button-3>", rclick_fn)
            w.bind("<Enter>",
                   lambda e, r=row: r.configure(fg_color=t["row_hover"]))
            w.bind("<Leave>",
                   lambda e, r=row: r.configure(
                       fg_color=self._row_cache.get(fp, {}).get("bg", bg)))

        self._row_cache[fp] = {"row": row, "lbl": lbl, "lbl_w": lbl_w,
                               "indicator": ind_w, "bg": bg, "is_watched": is_w}

    # ── 指示器构建 ────────────────────────────────────
    def _build_indicator(self, parent, is_selected: bool, is_watched: bool,
                         t: dict) -> ctk.CTkLabel:
        """创建指示器控件"""
        if self._select_mode:
            if is_selected:
                ind = ctk.CTkLabel(parent, text="✓", font=font(12, "bold"),
                                   text_color="#ffffff", fg_color=t["accent"],
                                   corner_radius=5, width=22, height=22)
            else:
                ind = ctk.CTkLabel(parent, text="", font=font(12),
                                   text_color=t["text_dim"],
                                   fg_color=t["cb_unchecked"],
                                   corner_radius=5, width=22, height=22)
        else:
            # 默认模式：未看显示圆点，已看隐藏
            if is_watched:
                ind = ctk.CTkLabel(parent, text="", font=font(14), width=22)
            else:
                ind = ctk.CTkLabel(parent, text="●", font=font(14),
                                   text_color=t["text_dim"], width=22)
        ind.pack(side="left", padx=(6, 0))
        return ind

    def _indicator_cfg(self, is_selected: bool, is_watched: bool, t: dict) -> dict:
        """返回指示器的 configure 参数"""
        if self._select_mode:
            if is_selected:
                return {"text": "✓", "text_color": "#ffffff",
                        "fg_color": t["accent"], "font": font(12, "bold")}
            else:
                return {"text": "", "text_color": t["text_dim"],
                        "fg_color": t["cb_unchecked"], "font": font(12)}
        else:
            # 默认模式：已看隐藏圆点
            return {"text": "" if is_watched else "●",
                    "text_color": t["text_dim"],
                    "fg_color": "transparent", "font": font(14)}

    # ── 选择交互 ──────────────────────────────────────
    def _on_indicator_click(self, fp: str, event=None):
        if not self._select_mode:
            return
        if fp in self._selected_fps:
            self._selected_fps.discard(fp)
        else:
            self._selected_fps.add(fp)
        self._update_indicator(fp)
        if self._on_sel_change:
            self._on_sel_change(len(self._selected_fps))

    def _update_indicator(self, fp: str):
        """更新单行指示器和背景"""
        c = self._row_cache.get(fp)
        if c is None or not c["row"].winfo_exists():
            return
        t = tc()
        is_sel = fp in self._selected_fps
        is_w = c.get("is_watched", False)
        c["indicator"].configure(**self._indicator_cfg(is_sel, is_w, t))
        c["is_watched"] = is_w
        idx = list(self._row_cache.keys()).index(fp)
        new_bg = self._row_bg(idx, is_sel, t)
        c["row"].configure(fg_color=new_bg)
        c["bg"] = new_bg

    def _update_indicator_visual(self, c: dict, is_sel: bool, is_w: bool, t: dict):
        """刷新时更新指示器外观（不复建控件）"""
        c["indicator"].configure(**self._indicator_cfg(is_sel, is_w, t))
        c["is_watched"] = is_w

    def _update_all_indicators(self):
        """批量更新所有行的指示器"""
        t = tc()
        for i, (fp, c) in enumerate(self._row_cache.items()):
            if not c["row"].winfo_exists():
                continue
            is_sel = fp in self._selected_fps
            is_w = c.get("is_watched", False)
            c["indicator"].configure(**self._indicator_cfg(is_sel, is_w, t))
            bg = self._row_bg(i, is_sel, t)
            c["row"].configure(fg_color=bg)
            c["bg"] = bg
            if self._select_mode:
                c["indicator"].bind("<Button-1>", partial(self._on_indicator_click, fp))
            else:
                c["indicator"].bind("<Button-1>", lambda e: None)

    # ── 打开 / 右键 ─────────────────────────────────────
    def _open(self, full_path: str):
        if self._select_mode:
            return
        self._on_open(full_path)
        self.refresh()

    def _rclick(self, full_path: str, fname: str, event):
        from ui.menus import VideoContextMenu
        if self._select_mode and self._selected_fps:
            if full_path in self._selected_fps:
                paths = self.get_selected()
            else:
                paths = [full_path]
        else:
            paths = [full_path]

        VideoContextMenu(self._app_win or self._container.winfo_toplevel(),
                         event, paths, self._folder_path,
                         self._dm, self.refresh, self._app_win,
                         on_enter_select=self._on_enter_select_cb)
