"""平滑滚动容器 — 用原生 Canvas + Scrollbar 替代 CTkScrollableFrame

全局滚轮策略：在 root 上绑定一次，用坐标判断是否在本区域内，
不再 bind/unbind（消除快速移动鼠标时的频繁绑定操作）。
"""
import customtkinter as ctk
from tkinter import Canvas
from config import tc


class SmoothScrollFrame(ctk.CTkFrame):
    """Canvas 驱动的滚动区域

    用法：
        scroll = SmoothScrollFrame(parent, fg_color="transparent")
        btn = ctk.CTkButton(scroll.content, text="hello")
        btn.pack()
    """

    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)

        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # Canvas
        self._canvas = Canvas(self, highlightthickness=0, bd=0,
                              bg=self._lookup_bg(kwargs.get("fg_color", "transparent")))
        self._canvas.grid(row=0, column=0, sticky="nsew")

        # Scrollbar
        self._scrollbar = ctk.CTkScrollbar(self, command=self._on_scrollbar)
        self._scrollbar.grid(row=0, column=1, sticky="ns")
        self._canvas.configure(yscrollcommand=self._on_scroll)

        # 内部容器
        self.content = ctk.CTkFrame(self._canvas, fg_color="transparent")
        self._win_id = self._canvas.create_window((0, 0), window=self.content,
                                                   anchor="nw", tags="content")

        # 内容尺寸变化 → 更新 scrollregion
        self.content.bind("<Configure>", self._on_content_configure)
        self._canvas.bind("<Configure>", self._on_canvas_configure)

        # 全局滚轮：在 root 上绑定一次，解绑放在 destroy()
        self._wheel_bound = False
        self._wheel_root = None
        self._wheel_ids = []
        self._bind_wheel_once()

    def _bind_wheel_once(self):
        """在 toplevel 上绑定一次滚轮，用坐标判断是否在区域内"""
        if self._wheel_bound:
            return
        self._wheel_root = self.winfo_toplevel()
        self._wheel_ids = []
        for seq in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            fid = self._wheel_root.bind(seq, self._on_mousewheel, add="+")
            self._wheel_ids.append((seq, fid))
        self._wheel_bound = True

    def _on_mousewheel(self, event):
        """滚轮事件：检查鼠标是否在本区域内，是则滚动"""
        if not self.winfo_exists():
            return
        x, y = event.x_root, event.y_root
        rx = self.winfo_rootx()
        ry = self.winfo_rooty()
        if not (rx <= x <= rx + self.winfo_width() and
                ry <= y <= ry + self.winfo_height()):
            return
        if event.num == 4 or event.delta > 0:
            self._canvas.yview_scroll(-1, "units")
        elif event.num == 5 or event.delta < 0:
            self._canvas.yview_scroll(1, "units")

    def _lookup_bg(self, fg_color) -> str:
        if not fg_color or fg_color == "transparent":
            return tc()["canvas_bg"]
        if fg_color.startswith("#"):
            return fg_color
        try:
            return self.cget("fg_color") or tc()["canvas_bg"]
        except Exception:
            return tc()["canvas_bg"]

    def _on_content_configure(self, event):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    def _on_canvas_configure(self, event):
        # 防抖：Canvas 宽度变化时不立即 resize，等 50ms 稳定后再调整
        if hasattr(self, '_resize_job_c') and self._resize_job_c:
            try: self.after_cancel(self._resize_job_c)
            except Exception: pass
        w = event.width
        self._resize_job_c = self.after(50, lambda: self._apply_canvas_width(w))

    def _apply_canvas_width(self, w: int):
        self._resize_job_c = None
        if self.winfo_exists():
            self._canvas.itemconfig(self._win_id, width=w)

    def _on_scrollbar(self, *args):
        if len(args) >= 2 and args[0] == "moveto":
            self._canvas.yview_moveto(float(args[1]))
        elif len(args) >= 3 and args[0] == "scroll":
            self._canvas.yview_scroll(int(args[1]), args[2])
        elif len(args) == 2:
            self._canvas.yview_moveto(float(args[0]))

    def _on_scroll(self, *args):
        self._scrollbar.set(*args)

    def destroy(self):
        """解绑全局滚轮后销毁"""
        if self._wheel_bound and self._wheel_root:
            for seq, fid in self._wheel_ids:
                try:
                    self._wheel_root.unbind(seq, fid)
                except Exception:
                    pass
            self._wheel_ids = []
            self._wheel_bound = False
        super().destroy()
