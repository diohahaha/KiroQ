"""数据模型 dataclass 定义"""
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class FolderMeta:
    name:    str            = ""
    desc:    str            = ""
    cover:   str            = ""
    link:    str            = ""
    note:    str            = ""
    rating:  Optional[float]= None
    status:  str            = ""
    source:  str            = "bangumi"
    bgm_id:  Optional[int]  = None   # Bangumi subject ID
    fetched: bool           = False  # 是否已自动抓取过
    video_view_mode: str    = "list" # "list" 或 "grid"

    @staticmethod
    def from_dict(d: dict) -> "FolderMeta":
        return FolderMeta(
            name    = d.get("name",""),
            desc    = d.get("desc",""),
            cover   = d.get("cover",""),
            link    = d.get("link",""),
            note    = d.get("note",""),
            rating  = d.get("rating"),
            status  = d.get("status",""),
            source  = d.get("source","bangumi"),
            bgm_id          = d.get("bgm_id"),
            fetched         = d.get("fetched", False),
            video_view_mode = d.get("video_view_mode", "list"),
        )

    def to_dict(self) -> dict:
        return {
            "name":    self.name,
            "desc":    self.desc,
            "cover":   self.cover,
            "link":    self.link,
            "note":    self.note,
            "rating":  self.rating,
            "status":  self.status,
            "source":  self.source,
            "bgm_id":          self.bgm_id,
            "fetched":         self.fetched,
            "video_view_mode": self.video_view_mode,
        }
