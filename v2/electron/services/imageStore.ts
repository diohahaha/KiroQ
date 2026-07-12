/**
 * 图片库数据存储：独立 JSON 文件（kiroq-image-data.json），不与视频库共用。
 * 结构对齐 electron/services/store.ts 的写法（内存态 + 500ms 防抖写盘）。
 * 注意：项目里已有 electron/utils/debounce.ts，这里直接复用；
 * 如果签名不同，把下面 debounce(...) 换成你项目里的实际调用方式即可。
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { ImageAppData, ImageFolder, ImageTagDef } from '../../shared/types'
import { DEFAULT_IMAGE_APP_DATA } from '../../shared/types'
import { debounce } from '../utils/debounce'

function dataFilePath(): string {
  return path.join(app.getPath('userData'), 'kiroq-image-data.json')
}

let cache: ImageAppData | null = null

function load(): ImageAppData {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(dataFilePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    // 注意：typeFilter 是嵌套对象，不能直接浅合并——如果磁盘上是旧版本存的
    // { image, archive, ebook }（还没有 video/other 字段），`{...DEFAULT, ...parsed}`
    // 会用旧的 typeFilter 整个替换掉默认值，新增的 video/other 字段就丢了，
    // 变成 undefined，导致筛选逻辑判断出错。这里单独把 typeFilter 深合并一层。
    cache = {
      ...DEFAULT_IMAGE_APP_DATA,
      ...parsed,
      typeFilter: { ...DEFAULT_IMAGE_APP_DATA.typeFilter, ...(parsed.typeFilter || {}) },
    }
  } catch {
    cache = { ...DEFAULT_IMAGE_APP_DATA }
  }
  return cache!
}

function writeNow(): void {
  if (!cache) return
  try {
    fs.writeFileSync(dataFilePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (e) {
    console.error('[imageStore] write failed:', e)
  }
}

const debouncedWrite = debounce(writeNow, 500)

export function getImageData(): ImageAppData {
  return load()
}

function persist(): void {
  debouncedWrite()
}

export function setImageRoot(root: string): void {
  const d = load()
  d.root = root
  persist()
}

export function recordImageAdded(folderPath: string): void {
  const d = load()
  if (d.addedTime[folderPath] == null) {
    d.addedTime[folderPath] = Date.now()
    persist()
  }
}

export function setImageMeta(folderPath: string, partial: Partial<ImageFolder>): void {
  const d = load()
  const existing: ImageFolder = d.folderMeta[folderPath] || {
    path: folderPath,
    name: path.basename(folderPath),
    desc: '',
    cover: '',
    note: '',
    tags: [],
    addedAt: d.addedTime[folderPath] || Date.now(),
    fileViewMode: 'list',
  }
  d.folderMeta[folderPath] = { ...existing, ...partial }
  persist()
}

export function setFolderTags(folderPath: string, tags: string[]): void {
  setImageMeta(folderPath, { tags })
}

export function setFileTags(filePath: string, tags: string[]): void {
  const d = load()
  if (tags.length === 0) delete d.fileTags[filePath]
  else d.fileTags[filePath] = tags
  persist()
}

export function toggleFolderWatched(folderPath: string): boolean {
  const d = load()
  const idx = d.folderWatched.indexOf(folderPath)
  let result: boolean
  if (idx >= 0) { d.folderWatched.splice(idx, 1); result = false }
  else { d.folderWatched.push(folderPath); result = true }
  persist()
  return result
}

export function toggleFileWatched(filePath: string, folderPath: string): boolean {
  const d = load()
  const list = d.fileWatched[folderPath] || (d.fileWatched[folderPath] = [])
  const idx = list.indexOf(filePath)
  let result: boolean
  if (idx >= 0) { list.splice(idx, 1); result = false }
  else { list.push(filePath); result = true }
  persist()
  return result
}

export function recordOpened(filePath: string): void {
  const d = load()
  d.lastOpened[filePath] = Date.now()
  persist()
}

export function saveTagDefs(defs: ImageTagDef[]): void {
  const d = load()
  d.tagDefs = defs
  persist()
}

export function saveImageFilter(partial: Partial<Pick<ImageAppData, 'autoFilterEmpty' | 'filterKeywords' | 'typeFilter'>>): void {
  const d = load()
  Object.assign(d, partial)
  persist()
}

export function toggleImagePin(folderPath: string): boolean {
  const d = load()
  const idx = d.pinned.indexOf(folderPath)
  let result: boolean
  if (idx >= 0) { d.pinned.splice(idx, 1); result = false }
  else { d.pinned.push(folderPath); result = true }
  persist()
  return result
}

export function toggleImageHide(folderPath: string): boolean {
  const d = load()
  const idx = d.hidden.indexOf(folderPath)
  let result: boolean
  if (idx >= 0) { d.hidden.splice(idx, 1); result = false }
  else { d.hidden.push(folderPath); result = true }
  persist()
  return result
}

export function batchToggleImagePin(paths: string[]): void {
  const d = load()
  const allPinned = paths.every(p => d.pinned.includes(p))
  if (allPinned) {
    d.pinned = d.pinned.filter(p => !paths.includes(p))
  } else {
    for (const p of paths) if (!d.pinned.includes(p)) d.pinned.push(p)
  }
  persist()
}

export function batchToggleImageHide(paths: string[]): void {
  const d = load()
  const allHidden = paths.every(p => d.hidden.includes(p))
  if (allHidden) {
    d.hidden = d.hidden.filter(p => !paths.includes(p))
  } else {
    for (const p of paths) if (!d.hidden.includes(p)) d.hidden.push(p)
  }
  persist()
}

/** 批量删除：可以是文件夹路径，也可以是文件路径，磁盘删除交给调用方（IPC 层），这里只清理引用数据 */
export function purgeImageReferences(paths: string[]): void {
  const d = load()
  for (const p of paths) {
    delete d.folderMeta[p]
    delete d.addedTime[p]
    delete d.fileWatched[p]
    delete d.fileTags[p]
    delete d.lastOpened[p]
    d.pinned = d.pinned.filter(x => x !== p)
    d.hidden = d.hidden.filter(x => x !== p)
    d.folderWatched = d.folderWatched.filter(x => x !== p)
  }
  persist()
}

export function setImageSort(sortKey: ImageAppData['sortKey'], sortDesc: boolean): void {
  const d = load()
  d.sortKey = sortKey
  d.sortDesc = sortDesc
  persist()
}

/** 应用退出前强制立即写盘（跳过防抖延迟），main.ts 的 before-quit 里调用 */
export function flushImageStore(): void {
  writeNow()
}
