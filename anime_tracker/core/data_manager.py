"""数据读写管理，带防抖 save 和版本迁移"""
import os, json, tempfile, threading, logging
from core.models import FolderMeta
from config import DATA_FILE, DATA_VERSION, VIDEO_EXTS, DEFAULT_FILTER_KEYWORDS

log = logging.getLogger(__name__)

def np(path: str) -> str:
    return os.path.normpath(path) if path else path

_DEFAULT = {
    "version": DATA_VERSION,
    "root": "", "watched": {}, "folder_meta": {},
    "sort_key": "name", "sort_desc": False,
    "last_watched_time": {}, "added_time": {},
    "pinned": [], "hidden": [],
    "video_durations": {},   # 视频时长缓存: {路径: 秒数}
    "settings": {
        "show_hidden":     False,
        "auto_filter":     True,
        "theme_preset":    "dark_blue",
        "player_path":     "",
        "auto_fetch":      True,
        "filter_keywords": "",
    }
}

def _migrate(d: dict) -> dict:
    """按版本号升级旧数据"""
    v = d.get("version", 1)
    if v < 2:
        # v1→v2: 加 fetched 字段、settings.auto_fetch
        d.setdefault("settings", {})
        d["settings"].setdefault("auto_fetch", True)
        for meta in d.get("folder_meta", {}).values():
            meta.setdefault("fetched", False)
        d["version"] = 2
        log.info("migrated data v1→v2")
    if v < 3:
        # v2→v3: 合并 theme + color_theme → theme_preset
        s = d.setdefault("settings", {})
        if "theme_preset" not in s:
            old_theme = s.pop("theme", "dark")
            old_color = s.pop("color_theme", "blue")
            if old_theme == "system":
                s["theme_preset"] = "system"
            else:
                s["theme_preset"] = f"{old_theme}_{old_color}"
        d["version"] = 3
        log.info("migrated data v2→v3")
    return d

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
            d = _migrate(d)
            # 补全缺失字段
            for k, v in _DEFAULT.items():
                if k not in d:
                    d[k] = v if not isinstance(v, dict) else dict(v)
            for k, v in _DEFAULT["settings"].items():
                d["settings"].setdefault(k, v)
            # 统一路径
            d["root"]              = np(d["root"])
            d["watched"]           = {np(k): [np(v) for v in vs] for k, vs in d["watched"].items()}
            d["folder_meta"]       = {np(k): v for k, v in d["folder_meta"].items()}
            d["last_watched_time"] = {np(k): v for k, v in d["last_watched_time"].items()}
            d["added_time"]        = {np(k): v for k, v in d["added_time"].items()}
            d["pinned"]            = [np(p) for p in d["pinned"]]
            d["hidden"]            = [np(p) for p in d["hidden"]]
            return d
        except json.JSONDecodeError:
            log.error("data file corrupted, using defaults")
            _backup_corrupt()
        except Exception as e:
            log.exception(f"load_data unexpected error: {e}")
    result = {}
    for k, v in _DEFAULT.items():
        result[k] = v if not isinstance(v, dict) else dict(v)
    return result

def _backup_corrupt():
    try:
        import shutil
        shutil.copy2(DATA_FILE, DATA_FILE + ".bak")
    except Exception:
        pass

def _atomic_save(data: dict) -> bool:
    tmp = None
    try:
        dir_ = os.path.dirname(DATA_FILE) or "."
        fd, tmp = tempfile.mkstemp(dir=dir_, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
        return True
    except Exception as e:
        log.error(f"save_data failed: {e}")
        return False
    finally:
        if tmp and os.path.exists(tmp):
            try: os.unlink(tmp)
            except Exception: pass


class DataManager:
    """封装数据访问，带 500ms 防抖写入"""

    def __init__(self):
        self._data        = load_data()
        self._save_timer: threading.Timer | None = None
        self._lock        = threading.Lock()

    # ── 基本读写 ──────────────────────────────────────
    @property
    def data(self) -> dict:
        return self._data

    def save(self, immediate: bool = False):
        """防抖保存：500ms 内连续调用只写一次"""
        with self._lock:
            if self._save_timer:
                self._save_timer.cancel()
            if immediate:
                _atomic_save(self._data)
            else:
                self._save_timer = threading.Timer(0.5, lambda: _atomic_save(self._data))
                self._save_timer.start()

    def flush(self):
        """立即写入（关闭前调用）"""
        with self._lock:
            if self._save_timer:
                self._save_timer.cancel()
                self._save_timer = None
        _atomic_save(self._data)

    # ── FolderMeta ────────────────────────────────────
    def get_meta(self, folder_path: str) -> FolderMeta:
        d = self._data["folder_meta"].get(np(folder_path), {})
        return FolderMeta.from_dict(d)

    def set_meta(self, folder_path: str, meta: FolderMeta):
        self._data["folder_meta"][np(folder_path)] = meta.to_dict()
        self.save()

    # ── 设置 ──────────────────────────────────────────
    def settings(self) -> dict:
        return self._data.get("settings", {})

    def set_settings(self, s: dict):
        self._data["settings"] = s
        self.save(immediate=True)

    # ── 观看记录 ──────────────────────────────────────
    def mark_watched(self, file_path: str, folder_path: str):
        import time
        fp = np(folder_path); vp = np(file_path)
        watched = self._data["watched"].setdefault(fp, [])
        if vp not in watched:
            watched.append(vp)
        ts  = time.time()
        lwt = self._data.setdefault("last_watched_time", {})
        p   = fp
        root = np(self._data.get("root",""))
        while True:
            lwt[p] = ts
            if p == root: break
            parent = np(os.path.dirname(p))
            if parent == p: break
            p = parent
        self.save()

    def clear_watched(self, folder_path: str):
        self._data["watched"][np(folder_path)] = []
        self.save()

    def is_watched(self, file_path: str, folder_path: str) -> bool:
        return np(file_path) in self._data["watched"].get(np(folder_path), [])

    # ── 置顶 / 隐藏 ───────────────────────────────────
    def toggle_pin(self, folder_path: str):
        p    = np(folder_path)
        pins = self._data.setdefault("pinned", [])
        if p in pins: pins.remove(p)
        else:         pins.insert(0, p)
        self.save()

    def toggle_hide(self, folder_path: str):
        p      = np(folder_path)
        hidden = self._data.setdefault("hidden", [])
        if p in hidden: hidden.remove(p)
        else:           hidden.append(p)
        self.save()

    def is_pinned(self, fp: str) -> bool: return np(fp) in self._data.get("pinned",[])
    def is_hidden(self, fp: str) -> bool: return np(fp) in self._data.get("hidden",[])

    # ── 视频时长缓存 ──────────────────────────────────
    def get_duration(self, file_path: str) -> float | None:
        """获取缓存的视频时长（秒），未扫描则返回 None"""
        return self._data.get("video_durations", {}).get(np(file_path))

    def set_duration(self, file_path: str, seconds: float):
        """缓存视频时长"""
        self._data.setdefault("video_durations", {})[np(file_path)] = seconds
        self.save()

    # ── 添加时间记录 ──────────────────────────────────
    def record_added(self, folder_path: str):
        import time
        p = np(folder_path)
        if p not in self._data["added_time"]:
            self._data["added_time"][p] = time.time()
            self.save()


# ── 文件系统工具 ──────────────────────────────────────
def scan_folder(folder: str) -> tuple[list[str], list[str]]:
    """一次 scandir 返回 (subdirs, videofiles)"""
    subdirs, videos = [], []
    try:
        for entry in os.scandir(folder):
            if entry.is_dir(follow_symlinks=False):
                subdirs.append(entry.name)
            elif entry.is_file(follow_symlinks=False):
                if os.path.splitext(entry.name)[1].lower() in VIDEO_EXTS:
                    videos.append(entry.name)
    except Exception as e:
        log.warning(f"scan_folder({folder}): {e}")
    subdirs.sort(key=natural_key)
    videos.sort( key=natural_key)
    return subdirs, videos

def natural_key(s: str) -> list:
    import re
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r"(\d+)", s)]

def is_anime_folder(folder_path: str, auto_filter: bool, settings: dict | None = None) -> bool:
    """判断是否应该显示该文件夹（auto_filter 开启时过滤非番剧文件夹）"""
    if not auto_filter:
        return True
    name = os.path.basename(folder_path).lower().strip()
    # 合并内置关键词 + 用户自定义关键词
    keywords = set(DEFAULT_FILTER_KEYWORDS)
    if settings:
        extra = settings.get("filter_keywords", "")
        if extra:
            keywords.update(k.strip().lower() for k in extra.split(",") if k.strip())
    if name in keywords:
        return False
    # 如果文件夹里既没有视频也没有子文件夹，过滤掉
    subdirs, videos = scan_folder(folder_path)
    if not videos and not subdirs:
        return False
    return True

def get_video_files(folder: str) -> list[str]:
    """返回文件夹下的视频文件列表"""
    _, videos = scan_folder(folder)
    return videos

def get_display_name(folder_path: str, meta: FolderMeta) -> str:
    return meta.name or os.path.basename(folder_path)
