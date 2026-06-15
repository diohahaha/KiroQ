"""ui/grid.py — 番剧宫格，自适应间距

布局策略
--------
1. 计算当前容器可用宽度
2. 在 [GAP_MIN, GAP_MAX] 范围内线性扩大间距，充分利用空白
3. 当间距已到 GAP_MAX 还有多余空间时，自动加一列（列数增加后间距重置到 GAP_MIN）
4. 这样实现"中间格距随窗口变大而变大，超过阈值补列"的效果

性能优化
--------
- 封面图异步加载：主线程先放占位图，后台换真图（每批最多并发 4 张）
- 所有 after() 定时任务在销毁时取消，避免野指针回调
- 懒渲染：只渲染可见窗口 + 缓冲区内的卡片（TODO：虚拟化，目前先做批量延迟）
"""

import os, threading, logging
import customtkinter as ctk
from functools import partial
from typing import Callable

from config import CARD_W, CARD_H, COVER_W, COVER_H, tc
from utils import font, get_cover_ctk, invalidate_cover, Tooltip
# DataManager 通过传参注入，不在顶层 import 以避免循环引用

log = logging.getLogger(__name__)

# ── 布局常量 ─────────────────────────────────────────
GAP_MIN     = 10    # 最小间距（px）
GAP_MAX     = 32    # 最大间距，超出则补列
PAD_X       = 16    # 容器左右内边距（和 SmoothScrollFrame padx 对齐）
BATCH_SIZE  = 20    # 每批渲染的卡片数（分批 after 避免主线程卡顿）
BATCH_DELAY = 8     # 批次间隔（ms）


def _calc_cols_and_gap(container_width: int, card_w: int) -> tuple[int, int]:
    """根据容器宽度计算列数和间距

    策略：从 1 列开始往上试，找能放下且 gap >= GAP_MIN 的最大列数。
    gap 超过 GAP_MAX 时夹住到 GAP_MAX（视觉上不会太松散）。

    Returns:
        (cols, gap)  gap 单位 px，左右各 gap//2
    """
    usable = max(container_width - PAD_X * 2, card_w)
    best_cols, best_gap = 1, GAP_MIN
    for cols in range(1, 100):          # 上限 100 列足够
        gaps      = cols + 1            # 列间 + 两侧 共 cols+1 段
        total_gap = usable - cols * card_w
        gap       = total_gap // gaps
        if gap < GAP_MIN:
            break                       # 再多一列就太挤，停止
        best_cols = cols
        best_gap  = min(gap, GAP_MAX)
    return best_cols, best_gap


class AnimeCard(ctk.CTkFrame):
    """单张番剧卡片（封面 + 标题 + 状态标签）"""

    STATUS_EMOJI = {
        "watching": "📺",
        "want":     "🔖",
        "done":     "✅",
        "paused":   "⏸",
    }

    def __init__(self, parent, folder_path: str, display_name: str,
                 dm, image_refs: list,
                 on_enter: Callable, on_right_click: Callable,
                 is_hidden: bool = False, video_count: int = 0,
                 defer_thumb: bool = False):
        t = tc()
        border = t["border_pin"] if dm.is_pinned(folder_path) else t["border"]
        bg     = t["hidden_card"] if is_hidden else t["bg_card"]
        super().__init__(parent,
                         width=CARD_W, height=CARD_H,
                         corner_radius=10,
                         border_width=1, border_color=border,
                         fg_color=bg)
        self.pack_propagate(False)

        self._folder     = folder_path
        self._name       = display_name
        self._dm         = dm
        self._image_refs = image_refs
        self._on_enter   = on_enter
        self._after_ids  = []

        self._build(t, is_hidden, video_count, defer_thumb)
        self._bind_events(on_right_click)

    # ── 构建 ─────────────────────────────────────────
    def _build(self, t: dict, is_hidden: bool, video_count: int = 0,
               defer_thumb: bool = False):
        meta      = self._dm.get_meta(self._folder)

        # 封面（异步加载，延迟批次跳过异步提取）
        lbl_img = ctk.CTkLabel(self, text="",
                                width=COVER_W, height=COVER_H,
                                corner_radius=8)
        lbl_img.pack(padx=0, pady=(6, 0), anchor="center")
        lbl_img.pack_propagate = lambda *a, **kw: None
        self._lbl_img = lbl_img

        if defer_thumb:
            # 延迟批次：只用同步封面（快速），不触发后台 ffmpeg
            cover_img = get_cover_ctk(self._folder, meta.cover, COVER_W, COVER_H,
                                       on_ready=None, root_widget=None)
        else:
            def _on_cover_ready(img, lbl=lbl_img):
                try:
                    if lbl.winfo_exists():
                        lbl.configure(image=img)
                        self._image_refs.append(img)
                except Exception:
                    pass
            cover_img = get_cover_ctk(self._folder, meta.cover, COVER_W, COVER_H,
                                       on_ready=_on_cover_ready, root_widget=self)
        self._image_refs.append(cover_img)
        lbl_img.configure(image=cover_img)

        # 进度条：使用预取的 video_count，避免 per-card 磁盘 I/O
        watched_list = self._dm.data["watched"].get(self._folder, [])
        watched      = len(watched_list)
        if watched > 0:
            total_ep = video_count or watched
            ratio    = min(watched / total_ep, 1.0)
            prog_bg  = ctk.CTkFrame(self, height=3, corner_radius=2,
                                    fg_color=t["border"])
            prog_bg.pack(fill="x", padx=6, pady=(3, 0))
            prog_bg.pack_propagate(False)
            fill_w = max(int(COVER_W * ratio), 4)
            ctk.CTkFrame(prog_bg, height=3, width=fill_w,
                         corner_radius=2,
                         fg_color=t["accent"]).place(x=0, y=0)

        # 标题颜色（看过的暗一点）
        watched = len(self._dm.data["watched"].get(self._folder, []))
        name_color = t["watched_text"] if watched > 0 else t["text_main"]
        if is_hidden:
            name_color = t["text_dim"]
        lbl_name = ctk.CTkLabel(self, text=self._name,
                                 font=font(12), text_color=name_color,
                                 wraplength=CARD_W - 10,
                                 justify="center", anchor="center")
        lbl_name.pack(fill="x", padx=5, pady=(4, 0))

        # 状态 + 评分行
        row = ctk.CTkFrame(self, fg_color="transparent")
        row.pack(fill="x", padx=6, pady=(2, 4))

        status_emoji = self.STATUS_EMOJI.get(meta.status, "")
        if status_emoji:
            ctk.CTkLabel(row, text=status_emoji, font=font(11),
                         text_color=t["text_dim"]).pack(side="left")

        if meta.rating:
            ctk.CTkLabel(row, text=f"⭐{meta.rating:.1f}", font=font(11),
                         text_color=t["text_dim"]).pack(side="right")

        # Tooltip
        tooltip_text = self._name
        if meta.name and meta.name != self._name:
            tooltip_text = f"{self._name}\n{meta.name}"
        Tooltip(self, tooltip_text)

        # 封面异步刷新（当 get_cover_ctk 返回占位图时）
        self._lbl_img = lbl_img

    def refresh_cover(self, ctk_img):
        """后台封面加载完成后由主线程调用"""
        try:
            if self.winfo_exists():
                self._lbl_img.configure(image=ctk_img)
                self._image_refs.append(ctk_img)
        except Exception:
            pass

    # ── 事件 ─────────────────────────────────────────
    def _bind_events(self, on_right_click: Callable):
        def enter(_=None):
            self._on_enter(self._folder,
                           self._dm.get_meta(self._folder).name or
                           os.path.basename(self._folder))

        def hover_in(_=None):
            t = tc()
            self.configure(border_color=t["border_hover"],
                           fg_color=t["hover"])

        def hover_out(_=None):
            t = tc()
            bc = t["border_pin"] if self._dm.is_pinned(self._folder) else t["border"]
            self.configure(border_color=bc, fg_color=t["bg_card"])

        def rclick(e):
            on_right_click(e, self._folder,
                           self._dm.get_meta(self._folder).name or
                           os.path.basename(self._folder))

        for w in self.winfo_children() + [self]:
            try:
                w.bind("<Button-1>",  enter,    add="+")
                w.bind("<Enter>",     hover_in, add="+")
                w.bind("<Leave>",     hover_out,add="+")
                w.bind("<Button-3>",  rclick,   add="+")
            except Exception:
                pass

    def destroy(self):
        for aid in self._after_ids:
            try: self.after_cancel(aid)
            except Exception: pass
        super().destroy()


class AnimeGrid(ctk.CTkFrame):
    """自适应宫格容器

    用法：
        grid = AnimeGrid(parent, dm, image_refs,
                         on_enter=..., on_right_click=...)
        grid.render(root_path, dir_names, clean_display=True)
    """

    def __init__(self, parent, dm, image_refs: list,
                 on_enter: Callable, on_right_click: Callable):
        super().__init__(parent, fg_color="transparent")
        self.pack(fill="both", expand=True)

        self._dm             = dm
        self._image_refs     = image_refs
        self._on_enter       = on_enter
        self._on_right_click = on_right_click
        self._after_ids: list[str] = []
        self._canvas_frame: ctk.CTkFrame | None = None  # 实际放卡片的 Frame

        # 响应容器宽度变化（防抖 200ms）
        self._resize_job: str | None = None
        self._render_idle_id: str | None = None   # 保存 after_idle id，防止堆积
        self._last_cols   = 0
        self._last_gap    = 0
        self._last_resize_w = 0
        self._rendering   = False   # 渲染中屏蔽 resize 事件
        self._pending_dirs: list[str] = []
        self._root_path    = ""
        self._clean_display = True

        self.bind("<Configure>", self._on_resize, add="+")

    # ── 公共 API ─────────────────────────────────────
    def render(self, root_path: str, dir_names: list[str],
               clean_display: bool = True):
        """渲染宫格（外部调用入口）"""
        self._root_path     = root_path
        self._pending_dirs  = dir_names
        self._clean_display = clean_display
        self._last_cols     = 0
        self._last_gap      = 0

        # ① 立即屏蔽 resize，防止 after_idle 执行前与 _check_reflow 产生竞态
        self._rendering = True

        # ② 取消挂起的 resize 防抖任务
        if self._resize_job:
            self.after_cancel(self._resize_job)
            self._resize_job = None

        # ③ 取消挂起的批量渲染任务（切换文件夹时中止旧批次）
        for aid in self._after_ids:
            try: self.after_cancel(aid)
            except Exception: pass
        self._after_ids.clear()

        # ④ 取消上次 render 注册但尚未执行的 after_idle（防多次快速调用时堆积）
        if self._render_idle_id:
            try: self.after_cancel(self._render_idle_id)
            except Exception: pass
            self._render_idle_id = None

        self._render_idle_id = self.after_idle(self._do_render)

    # ── 内部渲染 ──────────────────────────────────────
    def _on_resize(self, event):
        if self._rendering:
            return   # 主动渲染期间忽略 Configure 事件
        # 用实际宽度变化判断，而不是 event.widget，
        # 因为子控件 Configure 也会冒泡，但 self.winfo_width() 始终是容器真实宽度
        new_w = self.winfo_width()
        if new_w < 10 or new_w == getattr(self, "_last_resize_w", 0):
            return
        self._last_resize_w = new_w
        if self._resize_job:
            self.after_cancel(self._resize_job)
        self._resize_job = self.after(200, self._check_reflow)

    def _check_reflow(self):
        """宽度变化后决策：
        - 列数不变 → 只更新间距（pack_configure，极快，不销毁任何控件）
        - 列数改变 → 就地重排（移动卡片到新行，不销毁重建）
        """
        self._resize_job = None
        w = self.winfo_width()
        if w < 10:
            return
        cols, gap = _calc_cols_and_gap(w, CARD_W)
        if cols == self._last_cols:
            if abs(gap - self._last_gap) >= 1:
                self._adjust_gap(cols, gap)
        else:
            # 列数变了：就地重排，避免销毁重建导致的闪烁
            self._reflow(cols, gap)

    def _adjust_gap(self, cols: int, gap: int):
        """就地更新所有行容器和卡片的间距，不销毁/重建任何控件"""
        if not (self._canvas_frame and self._canvas_frame.winfo_exists()):
            return
        self._last_gap = gap
        total    = len(self._pending_dirs)
        num_rows = (total + cols - 1) // cols if cols else 0
        for row_idx in range(num_rows):
            attr = f"_row_{row_idx}"
            row  = getattr(self._canvas_frame, attr, None)
            if row is None or not row.winfo_exists():
                continue
            row.pack_configure(anchor="w", padx=gap)
            for col_idx, card in enumerate(row.winfo_children()):
                pad_left = gap if col_idx > 0 else 0
                try:
                    card.pack_configure(
                        padx=(pad_left, 0),
                        pady=(gap // 2, gap // 2),
                    )
                except Exception:
                    pass

    def _reflow(self, cols: int, gap: int):
        """列数变化时就地重排：收集所有卡片，按新列数重新 pack，不销毁任何控件"""
        self._rendering = True
        if not (self._canvas_frame and self._canvas_frame.winfo_exists()):
            self._do_render()
            return

        # 收集所有行里的卡片（按原顺序）
        cards = []
        row_idx = 0
        while True:
            row = getattr(self._canvas_frame, f'_row_{row_idx}', None)
            if row is None or not row.winfo_exists():
                break
            cards.extend(row.winfo_children())
            row_idx += 1

        if not cards:
            self._do_render()
            return

        # 销毁旧行容器（卡片先 pack_forget 脱离父控件）
        for card in cards:
            card.pack_forget()
        for i in range(row_idx):
            row = getattr(self._canvas_frame, f'_row_{i}', None)
            if row and row.winfo_exists():
                row.destroy()
            try: delattr(self._canvas_frame, f'_row_{i}')
            except Exception: pass

        # 按新列数重新排列
        self._last_cols = cols
        self._last_gap  = gap
        for idx, card in enumerate(cards):
            r = idx // cols
            c = idx % cols
            row_frame = self._get_or_create_row(r, gap)
            pad_left = gap if c > 0 else 0
            card.pack(in_=row_frame, side='left',
                      padx=(pad_left, 0), pady=(gap // 2, gap // 2))
        # reflow 完成后更新 _last_resize_w，防止对同一宽度触发第二次重排
        self._last_resize_w = self.winfo_width()
        self.after(0, lambda: setattr(self, "_rendering", False))

    def _do_render(self):
        """清空并重新布局所有卡片"""
        self._render_idle_id = None   # 已执行，清除引用
        self._rendering = True
        # 取消所有挂起的 after 任务
        for aid in self._after_ids:
            try: self.after_cancel(aid)
            except Exception: pass
        self._after_ids.clear()

        # 销毁旧卡片
        if self._canvas_frame and self._canvas_frame.winfo_exists():
            self._canvas_frame.destroy()

        self._canvas_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._canvas_frame.pack(fill="x", anchor="nw")

        # 强制同步 Canvas 宽度到 content frame
        # SmoothScrollFrame 的 50ms 延迟会导致 winfo_width() 返回 1
        p = self.master
        while p is not None:
            if hasattr(p, '_apply_canvas_width') and hasattr(p, '_canvas'):
                p._apply_canvas_width(p._canvas.winfo_width())
                break
            p = p.master if hasattr(p, 'master') else None
        self.update_idletasks()

        w = self.winfo_width()
        if w < 100:
            self._retry_render(attempt=1)
            return

        cols, gap = _calc_cols_and_gap(w, CARD_W)
        self._last_cols     = cols
        self._last_gap      = gap
        self._last_resize_w = w   # 记录本次渲染宽度，防止渲染后立即触发 _check_reflow

        if not self._pending_dirs:
            t = tc()
            ctk.CTkLabel(self._canvas_frame,
                         text="这里还没有番剧",
                         font=font(13), text_color=t["empty_text"]).pack(pady=40)
            self._rendering = False
            return

        self._prefetch_and_render(cols, gap)

    def _retry_render(self, attempt: int):
        """宽度还没到位：16ms 后重试，最多 5 次"""
        if attempt > 5:
            w = max(self._last_resize_w, 800)
            cols, gap = _calc_cols_and_gap(w, CARD_W)
            self._last_cols = cols
            self._last_gap  = gap
            self._last_resize_w = w
            if self._pending_dirs:
                self._prefetch_and_render(cols, gap)
            else:
                self._rendering = False
            return
        self._render_idle_id = self.after(16,
            lambda: self._do_render())

    def _prefetch_and_render(self, cols: int, gap: int):
        """批量预取视频数并分批渲染"""
        # ── 批量预取视频数（一次遍历，避免 per-card scandir）──
        self._video_counts: dict[str, int] = {}
        for d in self._pending_dirs:
            fp = os.path.normpath(os.path.join(self._root_path, d))
            try:
                from data import get_video_files
                self._video_counts[fp] = len(get_video_files(fp))
            except Exception:
                self._video_counts[fp] = 0

        # 分批渲染，避免一次性创建数百个控件卡主线程
        self._render_batch(self._pending_dirs, cols, gap, 0)

    def _render_batch(self, dirs: list[str], cols: int, gap: int, start: int):
        """分批次延迟渲染卡片（每批 BATCH_SIZE 张）"""
        if not (self._canvas_frame and self._canvas_frame.winfo_exists()):
            return
        end = min(start + BATCH_SIZE, len(dirs))
        batch = dirs[start:end]

        # 确保有足够的 row frames
        # 用 grid 布局，每行一个 Frame，Frame 内用 pack（方便间距控制）
        for i, d in enumerate(batch):
            idx        = start + i
            row_idx    = idx // cols
            col_idx    = idx % cols

            # 按需创建行容器
            row_frame = self._get_or_create_row(row_idx, gap)

            fp           = os.path.normpath(os.path.join(self._root_path, d))
            is_hidden    = self._dm.is_hidden(fp)
            s            = self._dm.settings()
            show_hidden  = s.get("show_hidden", False)
            if is_hidden and not show_hidden:
                continue  # 理论上不会进来，上层已过滤

            # 计算显示名
            meta = self._dm.get_meta(fp)
            if self._clean_display:
                from utils import clean_search_keyword
                display = meta.name or clean_search_keyword(d)
            else:
                display = meta.name or d

            # 只有第一批（可见卡）加载缩略图，后续批次只放占位图
            defer_thumb = (start + i) >= BATCH_SIZE
            card = AnimeCard(
                row_frame, fp, display,
                self._dm, self._image_refs,
                self._on_enter, self._on_right_click,
                is_hidden=is_hidden,
                video_count=self._video_counts.get(fp, 0),
                defer_thumb=defer_thumb,
            )
            # 左右间距（第一张不加左间距）
            pad_left  = gap if col_idx > 0 else 0
            pad_right = 0
            card.pack(side="left", padx=(pad_left, pad_right), pady=(gap // 2, gap // 2))

        # 下一批
        if end < len(dirs):
            aid = self.after(BATCH_DELAY,
                             lambda: self._render_batch(dirs, cols, gap, end))
            self._after_ids.append(aid)
        else:
            # 所有批次完成，延迟一帧后解除屏蔽
            self.after(0, lambda: setattr(self, "_rendering", False))

    # 行容器缓存（用列表按 row_idx 索引）
    def _get_or_create_row(self, row_idx: int, gap: int) -> ctk.CTkFrame:
        """按需创建或复用行容器"""
        attr = f"_row_{row_idx}"
        if hasattr(self._canvas_frame, attr):
            row = getattr(self._canvas_frame, attr)
            if row.winfo_exists():
                return row
        row = ctk.CTkFrame(self._canvas_frame, fg_color="transparent")
        row.pack(anchor="w", padx=gap, pady=0)
        setattr(self._canvas_frame, attr, row)
        return row

    def destroy(self):
        if self._render_idle_id:
            try: self.after_cancel(self._render_idle_id)
            except Exception: pass
        for aid in self._after_ids:
            try: self.after_cancel(aid)
            except Exception: pass
        super().destroy()
