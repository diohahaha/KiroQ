"""右键菜单、排序菜单、「···」菜单"""
import os, time
from functools import partial
import customtkinter as ctk
from utils import font, PopupMenu, confirm_dialog, show_toast, open_folder_explorer
from config import SORT_OPTIONS, STATUS_OPTIONS, STATUS_COLORS, tc
from core.data_manager import get_display_name, get_video_files, np


class SortMenu(PopupMenu):
    def __init__(self, parent, anchor, dm, refresh_fn):
        super().__init__(parent, 220, 215, anchor_widget=anchor)
        self.add_label("排序方式")
        cur = dm.data.get("sort_key","name")
        for label, key in SORT_OPTIONS:
            is_cur = (key == cur)
            def on_click(k=key):
                dm.data["sort_key"] = k; dm.save(); self.close(); refresh_fn()
            self.add_button(("● " if is_cur else "  ")+label, on_click,
                            text_color="#aaaacc" if is_cur else tc()["text_main"])
        self.add_label("顺序")
        dv = ctk.BooleanVar(value=dm.data.get("sort_desc",False))
        def tog():
            dm.data["sort_desc"] = dv.get(); dm.save(); self.close(); refresh_fn()
        ctk.CTkCheckBox(self.frame, text="降序（最新/最大在前）",
                        variable=dv, font=font(12), command=tog).pack(
                        anchor="w", padx=10, pady=(0,8))


class CardContextMenu(PopupMenu):
    def __init__(self, parent, event, folder_path: str,
                 display_name: str, dm, refresh_fn, app_win):
        super().__init__(parent, 200, 310, event=event)
        self.add_label(display_name[:22], color="#aaaacc")
        self.add_separator()

        is_pinned = dm.is_pinned(folder_path)
        is_hidden = dm.is_hidden(folder_path)
        videos    = get_video_files(folder_path)

        def toggle_pin():
            dm.toggle_pin(folder_path); self.close(); refresh_fn()

        def toggle_hide():
            dm.toggle_hide(folder_path); self.close(); refresh_fn()

        def mark_all():
            dm.data["watched"][folder_path] = [
                np(os.path.join(folder_path, v)) for v in videos]
            dm.data["last_watched_time"][folder_path] = time.time()
            dm.save(); self.close(); refresh_fn()
            show_toast(app_win, "✓ 已标记全部为已看")

        def clear_w():
            self.close()
            if confirm_dialog(app_win, "清除观看记录",
                              f"确定清除「{display_name}」的所有观看记录？"):
                dm.clear_watched(folder_path); refresh_fn()
                show_toast(app_win, "✓ 已清除观看记录")

        def open_folder():
            self.close(); open_folder_explorer(folder_path)

        def set_status(s):
            meta = dm.get_meta(folder_path); meta.status = s
            dm.set_meta(folder_path, meta); self.close(); refresh_fn()

        self.add_button("📌 置顶" if not is_pinned else "📌 取消置顶", toggle_pin)
        self.add_button("📂 打开文件夹", open_folder)
        self.add_button("✅ 全标为已看", mark_all)
        self.add_button("🗑  清除记录", clear_w, text_color="#cc8888",
                        hover_color="#2a1a1a")
        self.add_button("👁 隐藏" if not is_hidden else "👁 取消隐藏",
                        toggle_hide, text_color="#cc8888", hover_color="#2a1a1a")

        # 状态标签
        self.add_label("标签")
        sr  = ctk.CTkFrame(self.frame, fg_color="transparent")
        sr.pack(fill="x", padx=6, pady=(0,8))
        cur_s = dm.get_meta(folder_path).status
        for label, key in [(s[0],s[1]) for s in STATUS_OPTIONS]:
            sc  = STATUS_COLORS.get(key,"#2a2a2a") or "#2a2a2a"
            txt = label.split()[0] if label != "— 无标签" else "—"
            ctk.CTkButton(sr, text=txt, width=34, height=24, corner_radius=4,
                fg_color=sc, hover_color=sc, font=font(10), text_color="#ffffff",
                border_width=2 if key==cur_s else 0, border_color="#ffffff",
                command=partial(set_status, key)).pack(side="left", padx=2)


class MoreMenu(PopupMenu):
    def __init__(self, parent, anchor, folder_path: str,
                 display_name: str, dm, refresh_fn, app_win, open_edit_fn):
        super().__init__(parent, 180, 105, anchor_widget=anchor)

        def edit():
            self.close(); open_edit_fn()

        def clear():
            self.close()
            if confirm_dialog(app_win, "清除观看记录",
                              f"确定清除「{display_name}」的所有观看记录？"):
                dm.clear_watched(folder_path); refresh_fn()
                show_toast(app_win, "✓ 已清除观看记录")

        self.add_button("✏️  编辑信息", edit)
        self.add_button("🗑  清除观看记录", clear,
                        text_color="#cc6666", hover_color="#2a1a1a")


class VideoContextMenu(PopupMenu):
    """视频文件右键菜单（支持多选批量操作）"""
    def __init__(self, parent, event, file_paths: list[str], folder_path: str,
                 dm, refresh_fn, app_win):
        self._file_paths  = file_paths
        self._folder_path = folder_path
        self._dm          = dm
        self._refresh     = refresh_fn
        self._app_win     = app_win
        self._count       = len(file_paths)

        label = f"{os.path.basename(file_paths[0])[:22]}" if self._count == 1 \
                else f"已选 {self._count} 个文件"
        super().__init__(parent, 180, 150, event=event)
        self.add_label(label, color="#aaaacc")
        self.add_separator()

        # 批量状态判断
        all_watched = all(dm.is_watched(fp, folder_path) for fp in file_paths)

        self.add_button("▶ 打开", self._open_video)
        self.add_button("✗ 标记未看" if all_watched else "✓ 标记已看",
                        self._toggle_watched)
        self.add_button("📂 打开文件夹", self._open_folder)

    def _open_video(self):
        from utils import open_video
        self.close()
        player = self._dm.settings().get("player_path", "")
        for fp in self._file_paths:
            open_video(fp, player)
            self._dm.mark_watched(fp, self._folder_path)
        self._refresh()

    def _toggle_watched(self):
        self.close()
        all_watched = all(self._dm.is_watched(fp, self._folder_path)
                          for fp in self._file_paths)
        if all_watched:
            watched = self._dm.data["watched"].get(self._folder_path, [])
            for fp in self._file_paths:
                if fp in watched:
                    watched.remove(fp)
            self._dm.save()
            show_toast(self._app_win, f"✓ {self._count} 个文件已标记为未看")
        else:
            for fp in self._file_paths:
                self._dm.mark_watched(fp, self._folder_path)
            show_toast(self._app_win, f"✓ {self._count} 个文件已标记为已看")
        self._refresh()

    def _open_folder(self):
        self.close()
        open_folder_explorer(self._folder_path)
