import os, json, time, tempfile
import customtkinter as ctk
from config import DATA_FILE

def np(path: str) -> str:
    return os.path.normpath(path) if path else path

_DEFAULT = {
    "root": "", "watched": {}, "folder_meta": {},
    "sort_key": "name", "sort_desc": False,
    "last_watched_time": {}, "added_time": {},
    "pinned": [], "hidden": [],
    "settings": {
        "show_hidden": False,
        "theme": "dark",
        "player_path": "",
        "font_size": 12,
    }
}

def _migrate_old_data():
    """从旧版本迁移数据文件"""
    old_file = os.path.join(os.path.expanduser("~"), ".anime_tracker_data.json")
    if os.path.exists(old_file) and not os.path.exists(DATA_FILE):
        import shutil
        shutil.copy2(old_file, DATA_FILE)


def load_data() -> dict:
    _migrate_old_data()
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
            # 补全缺失字段（兼容旧版本）
            for k, v in _DEFAULT.items():
                if k not in d:
                    d[k] = v if not isinstance(v, dict) else dict(v)
            for k, v in _DEFAULT["settings"].items():
                d["settings"].setdefault(k, v)
            # 统一路径格式
            d["root"]              = np(d["root"])
            d["watched"]           = {np(k): [np(v) for v in vs] for k, vs in d["watched"].items()}
            d["folder_meta"]       = {np(k): v for k, v in d["folder_meta"].items()}
            d["last_watched_time"] = {np(k): v for k, v in d["last_watched_time"].items()}
            d["added_time"]        = {np(k): v for k, v in d["added_time"].items()}
            d["pinned"]            = [np(p) for p in d["pinned"]]
            d["hidden"]            = [np(p) for p in d["hidden"]]
            return d
        except json.JSONDecodeError:
            _warn_corrupt()
        except Exception as e:
            print(f"[load_data] unexpected error: {e}")
    result = {}
    for k, v in _DEFAULT.items():
        result[k] = v if not isinstance(v, dict) else dict(v)
    return result

def _warn_corrupt():
    win = ctk.CTkToplevel()
    win.title("数据文件损坏")
    win.geometry("380x140")
    win.grab_set()
    ctk.CTkLabel(win,
        text="⚠️  数据文件损坏，将使用空数据启动。\n原文件已备份为 .kiroq_data.json.bak",
        font=ctk.CTkFont(size=13), wraplength=340).pack(pady=24)
    ctk.CTkButton(win, text="确定", width=80, command=win.destroy).pack()
    # 备份损坏的文件
    try:
        bak = DATA_FILE + ".bak"
        import shutil; shutil.copy2(DATA_FILE, bak)
    except Exception:
        pass

def save_data(data: dict) -> bool:
    """原子写入：先写临时文件，再替换，防止写入中断损坏数据"""
    try:
        dir_ = os.path.dirname(DATA_FILE)
        fd, tmp = tempfile.mkstemp(dir=dir_, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
        return True
    except Exception as e:
        print(f"[save_data] failed: {e}")
        try: os.unlink(tmp)
        except Exception: pass
        return False

def get_video_files(folder: str) -> list[str]:
    from config import VIDEO_EXTS
    try:
        files = [f for f in os.listdir(folder)
                 if os.path.isfile(os.path.join(folder, f))
                 and os.path.splitext(f)[1].lower() in VIDEO_EXTS]
        files.sort(key=lambda x: _natural_key(x))
        return files
    except Exception:
        return []

def get_sub_dirs(folder: str) -> list[str]:
    try:
        dirs = [d for d in os.listdir(folder)
                if os.path.isdir(os.path.join(folder, d))]
        dirs.sort(key=lambda x: _natural_key(x))
        return dirs
    except Exception:
        return []

def scan_folder(folder: str) -> tuple[list[str], list[str]]:
    """一次 listdir 同时返回 (subdirs, videofiles)，减少磁盘 IO"""
    from config import VIDEO_EXTS
    subdirs, videos = [], []
    try:
        for entry in os.scandir(folder):
            if entry.is_dir(follow_symlinks=False):
                subdirs.append(entry.name)
            elif entry.is_file(follow_symlinks=False):
                if os.path.splitext(entry.name)[1].lower() in VIDEO_EXTS:
                    videos.append(entry.name)
    except Exception:
        pass
    subdirs.sort(key=lambda x: _natural_key(x))
    videos.sort( key=lambda x: _natural_key(x))
    return subdirs, videos

def _natural_key(s: str) -> list:
    import re
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r"(\d+)", s)]

def get_display_name(folder_path: str, meta: dict) -> str:
    return meta.get("name") or os.path.basename(folder_path)
