/**
 * 数据存储服务：匹配旧版 JSON 结构 + 500ms 防抖写入。
 * 已核对旧版 DataManager：完整字段迁移
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { debounce } from '../utils/debounce'
import type { AppData, AppSettings, AnimeFolder } from '../../shared/types'
import { DEFAULT_APP_DATA, DEFAULT_SETTINGS } from '../../shared/types'

const DATA_FILE_NAME = 'kiroq-data.json'

let appData: AppData = { ...DEFAULT_APP_DATA, version: 1 }

function dataFilePath(): string {
  return path.join(app.getPath('userData'), DATA_FILE_NAME)
}

function loadFromDisk(): AppData | null {
  const fp = dataFilePath()
  if (!fs.existsSync(fp)) return null
  try {
    const raw = fs.readFileSync(fp, 'utf-8')
    const data = JSON.parse(raw)
    const merged = { ...DEFAULT_APP_DATA, ...data }
    merged.folderMeta = merged.folderMeta || {}
    merged.watched = merged.watched || {}
    merged.pinned = Array.isArray(merged.pinned) ? merged.pinned : []
    merged.hidden = Array.isArray(merged.hidden) ? merged.hidden : []
    return merged as AppData
  } catch (e) {
    console.error('[store] load failed:', e)
    return null
  }
}

function writeToDisk(): void {
  const fp = dataFilePath()
  const dir = path.dirname(fp)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = fp + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(appData, null, 2), 'utf-8')
    fs.renameSync(tmp, fp)
  } catch (e) {
    console.error('[store] write failed:', e)
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch {}
  }
}

const debouncedSave = debounce(writeToDisk, 500)

// ── 公开 API ──

export function initStore(): AppData {
  const loaded = loadFromDisk()
  if (loaded) {
    appData = loaded
  }
  console.log(`[store] loaded: root=${appData.root}, folders=${Object.keys(appData.folderMeta).length}`)
  return appData
}

export function getData(): AppData {
  return appData
}

export function getMeta(folderPath: string): AnimeFolder | null {
  return appData.folderMeta[folderPath] || null
}

export function setMeta(folderPath: string, meta: Partial<AnimeFolder>): void {
  const existing = appData.folderMeta[folderPath] || {
    path: folderPath,
    name: '',
    desc: '',
    cover: '',
    link: '',
    note: '',
    rating: null,
    status: '' as const,
    source: 'bangumi',
    bgmId: null,
    fetched: false,
    videoViewMode: 'list' as const,
    addedAt: Date.now(),
  }
  appData.folderMeta[folderPath] = { ...existing, ...meta }
  save()
}

export function setRoot(root: string): void {
  appData.root = root
  save()
}

export function markWatched(videoPath: string, folderPath: string): void {
  const fp = folderPath
  const vp = videoPath
  if (!appData.watched[fp]) appData.watched[fp] = []
  const list = appData.watched[fp]
  if (!list.includes(vp)) list.push(vp)

  // 级联更新 lastWatchedTime（沿目录树往上）
  const ts = Date.now() / 1000
  let p = fp
  const root = appData.root
  while (true) {
    appData.lastWatchedTime[p] = ts
    if (p === root) break
    const parent = path.dirname(p)
    if (parent === p) break
    p = parent
  }
  save()
}

export function clearWatched(folderPath: string): void {
  appData.watched[folderPath] = []
  save()
}

export function togglePin(folderPath: string): boolean {
  const idx = appData.pinned.indexOf(folderPath)
  if (idx >= 0) {
    appData.pinned.splice(idx, 1)
    save()
    return false
  } else {
    appData.pinned.unshift(folderPath)
    save()
    return true
  }
}

export function toggleHide(folderPath: string): boolean {
  const idx = appData.hidden.indexOf(folderPath)
  if (idx >= 0) {
    appData.hidden.splice(idx, 1)
    save()
    return false
  } else {
    appData.hidden.push(folderPath)
    save()
    return true
  }
}

export function isPinned(fp: string): boolean {
  return appData.pinned.includes(fp)
}

export function isHidden(fp: string): boolean {
  return appData.hidden.includes(fp)
}

export function getWatched(folderPath: string): string[] {
  return appData.watched[folderPath] || []
}

export function setWatched(folderPath: string, videos: string[]): void {
  appData.watched[folderPath] = videos
  save()
}

export function getDuration(filePath: string): number | null {
  const v = appData.videoDurations[filePath]
  return v != null ? v : null
}

export function setDuration(filePath: string, seconds: number): void {
  appData.videoDurations[filePath] = seconds
  save()
}

export function recordAdded(folderPath: string): void {
  if (!(folderPath in appData.addedTime)) {
    appData.addedTime[folderPath] = Date.now() / 1000
  }
}

export function setSort(key: string, desc: boolean): void {
  appData.sortKey = key as AppData['sortKey']
  appData.sortDesc = desc
  save()
}

export function batchTogglePin(paths: string[]): void {
  const allPinned = paths.every(p => appData.pinned.includes(p))
  if (allPinned) {
    appData.pinned = appData.pinned.filter(p => !paths.includes(p))
  } else {
    for (const p of paths) {
      if (!appData.pinned.includes(p)) appData.pinned.push(p)
    }
  }
  save()
}

export function batchToggleHide(paths: string[]): void {
  const allHidden = paths.every(p => appData.hidden.includes(p))
  if (allHidden) {
    appData.hidden = appData.hidden.filter(p => !paths.includes(p))
  } else {
    for (const p of paths) {
      if (!appData.hidden.includes(p)) appData.hidden.push(p)
    }
  }
  save()
}

export function batchClearWatched(paths: string[]): void {
  for (const p of paths) {
    appData.watched[p] = []
  }
  save()
}

export function batchSetStatus(paths: string[], status: string): void {
  for (const p of paths) {
    if (!appData.folderMeta[p]) {
      appData.folderMeta[p] = {
        path: p, name: '', desc: '', cover: '', link: '', note: '',
        rating: null, status: '' as const, source: 'bangumi', bgmId: null,
        fetched: false, videoViewMode: 'list', addedAt: Date.now(),
      }
    }
    appData.folderMeta[p].status = status as AnimeFolder['status']
  }
  save()
}

export function save(): void {
  debouncedSave()
}

export function flush(): void {
  debouncedSave.flush()
}
