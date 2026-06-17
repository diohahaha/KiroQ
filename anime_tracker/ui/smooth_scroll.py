"""平滑滚动容器 — Canvas + pack 布局滚动条

滚动条用 pack(side="right") 参与布局，出现/消失时 Canvas 自动伸缩。
不使用 place 浮层，不需要手动计算宽度避让。
"""
import customtkinter as ctk
from tkinter import Canvas
from config import tc


class SmoothScrollFrame(ctk.CTkFrame):

    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)

        # 内层横向容器：Canvas 在左，Scrollbar 在右
        self._inner = ctk.CTkFrame(self, fg_color="transparent")
        self._inner.pack(fill="both", expand=True)

        self._scrollbar = ctk.CTkScrollbar(self._inner, command=self._on_scrollbar)
        # 先不 pack，等内容溢出再显示

        self._canvas = Canvas(self._inner, highlightthickness=0, bd=0,
                              bg=self._lookup_bg(kwargs.get("fg_color", "transparent")))
        self._canvas.configure(yscrollcommand=self._on_scroll)
        self._canvas.pack(side="left", fill="both", expand=True)

        self.content = ctk.CTkFrame(self._canvas, fg_color="transparent")
        self._win_id = self._canvas.create_window((0, 0), window=self.content,
                                                   anchor="nw", tags="content")

        self.content.bind("<Configure>", self._on_content_configure)
        self._canvas.bind("<Configure>", self._on_canvas_configure)

        self._wheel_bound = False
        self._wheel_root = None
        self._wheel_ids = []
        self._bind_wheel_once()

    # ── 滚轮 ─────────────────────────────────────────
    def _bind_wheel_once(self):
        if self._wheel_bound:
            return
        self._wheel_root = self.winfo_toplevel()
        self._wheel_ids = []
        for seq in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            fid = self._wheel_root.bind(seq, self._on_mousewheel, add="+")
            self._wheel_ids.append((seq, fid))
        self._wheel_bound = True

    def _on_mousewheel(self, event):
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

    # ── 布局 ─────────────────────────────────────────
    def _on_content_configure(self, event):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))
        self._update_scrollbar()

    def _on_canvas_configure(self, event):
        if event.width > 0:
            self._canvas.itemconfig(self._win_id, width=event.width)
        self._update_scrollbar()

    def _update_scrollbar(self):
        """内容超出显示滚动条（pack right），否则隐藏"""
        try:
            bbox = self._canvas.bbox("all")
            overflow = bbox and bbox[3] > self._canvas.winfo_height()
            if overflow:
                if not self._scrollbar.winfo_ismapped():
                    self._scrollbar.pack(side="right", fill="y")
            else:
                if self._scrollbar.winfo_ismapped():
                    self._scrollbar.pack_forget()
        except Exception:
            pass

    # ── 滚动同步 ─────────────────────────────────────
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
        if self._wheel_bound and self._wheel_root:
            for seq, fid in self._wheel_ids:
                try:
                    self._wheel_root.unbind(seq, fid)
                except Exception:
                    pass
            self._wheel_ids = []
            self._wheel_bound = False
        super().destroy()
