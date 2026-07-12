"""Bangumi API 抓取，带重试和相似度匹配"""
import os, logging, urllib.request
from typing import Optional
import difflib

log = logging.getLogger(__name__)

BGM_API     = "https://api.bgm.tv"
HEADERS     = {"User-Agent": "AnimeTracker/0.7 (github.com/your/repo)", "Accept": "application/json"}

def _session():
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    s     = requests.Session()
    retry = Retry(total=2, backoff_factor=0.5, status_forcelist=[500,502,503,504])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update(HEADERS)
    return s

def search(keyword: str, limit: int = 8) -> list[dict]:
    try:
        import requests as req
        s    = _session()
        resp = s.get(f"{BGM_API}/search/subject/{req.utils.quote(keyword)}",
                     params={"type":2,"responseGroup":"medium","max_results":limit},
                     timeout=8)
        resp.raise_for_status()
        results = []
        for item in resp.json().get("list", []):
            results.append({
                "id":       item.get("id"),
                "name":     item.get("name",""),
                "name_cn":  item.get("name_cn","") or item.get("name",""),
                "image":    (item.get("images") or {}).get("large",""),
                "summary":  item.get("summary",""),
                "air_date": item.get("air_date",""),
                "eps":      item.get("eps_count",0),
                "rating":   (item.get("rating") or {}).get("score"),
            })
        return results
    except Exception as e:
        log.warning(f"bangumi.search({keyword}): {e}")
        return []

def best_match(keyword: str, results: list[dict]) -> Optional[dict]:
    """用相似度算法找最匹配的结果"""
    if not results: return None
    kw = keyword.lower()
    def score(item):
        names = [item.get("name","").lower(), item.get("name_cn","").lower()]
        return max(difflib.SequenceMatcher(None, kw, n).ratio() for n in names if n)
    ranked = sorted(results, key=score, reverse=True)
    best   = ranked[0]
    if score(best) >= 0.4:   # 相似度门槛
        return best
    return None

def get_subject(subject_id: int) -> Optional[dict]:
    try:
        s    = _session()
        resp = s.get(f"{BGM_API}/v0/subjects/{subject_id}", timeout=8)
        resp.raise_for_status()
        item = resp.json()
        return {
            "id":       item.get("id"),
            "name":     item.get("name",""),
            "name_cn":  item.get("name_cn","") or item.get("name",""),
            "image":    (item.get("images") or {}).get("large",""),
            "summary":  item.get("summary",""),
            "air_date": item.get("date",""),
            "eps":      item.get("eps",0),
            "rating":   (item.get("rating") or {}).get("score"),
        }
    except Exception as e:
        log.warning(f"bangumi.get_subject({subject_id}): {e}")
        return None

def download_cover(url: str, save_dir: str, filename: str = "cover.jpg") -> Optional[str]:
    if not url: return None
    for attempt in range(3):
        try:
            save_path = os.path.join(save_dir, filename)
            req = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
            with urllib.request.urlopen(req, timeout=10) as resp:
                with open(save_path, "wb") as f:
                    f.write(resp.read())
            return save_path
        except Exception as e:
            log.warning(f"download_cover attempt {attempt+1}: {e}")
    return None
