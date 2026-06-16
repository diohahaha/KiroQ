"""导航栏 + 面包屑"""
import customtkinter as ctk
from functools import partial
from utils import font
from config import tc


class NavBar(ctk.CTkFrame):
    def __init__(self, parent, on_home, on_pick_root, on_settings, search_var):
        t = tc()
        super().__init__(parent, height=52, corner_radius=0, fg_color=t["bg_nav"])
        self.pack(fill="x", side="top")
        self.pack_propagate(False)
        self._on_home = on_home

        self._crumb_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._crumb_frame.pack(side="left", fill="y", padx=(8,0))

        right = ctk.CTkFrame(self, fg_color="transparent")
        right.pack(side="right", padx=12, pady=8)

        self.search_entry = ctk.CTkEntry(right, width=180, height=32,
                                          placeholder_text="🔍 搜索番剧…",
                                          textvariable=search_var, font=font(12))
        self.search_entry.pack(side="left", padx=(0,6))

        ctk.CTkButton(right, text="⚙", width=36, height=32,
                      fg_color="transparent", hover_color=t["link_hover"],
                      text_color=t["text_main"], font=font(16),
                      command=on_settings).pack(side="left", padx=(0,4))
        ctk.CTkButton(right, text="📁 根目录", width=100, height=32,
                      fg_color=t["btn_toggle_a"], hover_color=t["link_hover"],
                      text_color="#ffffff", font=font(12),
                      command=on_pick_root).pack(side="left")

    def rebuild(self, nav_stack: list):
        t = tc()
        for w in self._crumb_frame.winfo_children(): w.destroy()
        ctk.CTkButton(self._crumb_frame, text="⌂ 首页", width=72, height=32,
                      fg_color="transparent", hover_color=t["link_hover"],
                      text_color=t["text_main"], font=font(12),
                      command=self._on_home).pack(side="left", pady=10)
        for i, (path, name) in enumerate(nav_stack[1:], start=1):
            ctk.CTkLabel(self._crumb_frame, text=" › ", font=font(14),
                         text_color=t["crumb_sep"]).pack(side="left")
            short   = name if len(name) <= 16 else name[:14]+"…"
            is_last = (i == len(nav_stack)-1)
            cmd = partial(self._on_home) if is_last else None
            ctk.CTkButton(self._crumb_frame, text=short, height=28,
                fg_color="transparent", hover_color=t["link_hover"],
                text_color=t["crumb_last"] if is_last else t["crumb_mid"],
                font=font(12),
                command=cmd or (lambda p=path, n=name: self._nav_to(p, n))
            ).pack(side="left", pady=10)

    def _nav_to(self, path, name): pass  # 由 App 覆写注入
