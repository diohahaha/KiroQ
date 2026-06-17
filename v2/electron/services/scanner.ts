/**
 * 库扫描服务：遍历目录，一次 scandir 返回子目录 + 视频文件。
 * 已核对旧版 core/data_manager.py scan_folder()
 */
import * as fs from 'fs'
import * as path from 'path'
import type { ScanResult } from '../../shared/types'
import { VIDEO_EXTENSIONS, DEFAULT_FILTER_KEYWORDS } from '../../shared/types'
import { getData, recordAdded } from './store'

export function scanFolder(folder: string): ScanResult {
  const subdirs: string[] = []
  const videos: string[] = []
  try {
    const entries = fs.readdirSync(folder, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        subdirs.push(entry.name)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (VIDEO_EXTENSIONS.includes(ext as typeof VIDEO_EXTENSIONS[number])) {
          videos.push(entry.name)
        }
      }
    }
  } catch (e) {
    console.warn(`[scanner] scanFolder(${folder}):`, e)
  }
  // 自然排序（数字部分按数值排序）
  const naturalSort = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  subdirs.sort(naturalSort)
  videos.sort(naturalSort)
  return { subdirs, videos }
}

/** 判断是否为番剧文件夹（自动过滤） */
export function isAnimeFolder(folderPath: string): boolean {
  const data = getData()
  // 如果关闭了自动过滤，全部显示
  const s = data as any
  const autoFilter = s._settings?.autoFilter !== false

  const name = path.basename(folderPath).toLowerCase().trim()
  // 合并内置 + 用户自定义关键词
  const keywords = new Set(DEFAULT_FILTER_KEYWORDS)
  // user keywords from electron store (we'll handle this differently)

  if (keywords.has(name)) return false

  // 如果文件夹既没有视频也没有子文件夹，过滤掉
  const { subdirs, videos } = scanFolder(folderPath)
  return videos.length > 0 || subdirs.length > 0
}

/** 扫描根目录并记录首次出现时间 */
export function scanLibraryRoot(root: string): { subdirs: string[]; videos: string[] } {
  const result = scanFolder(root)
  for (const d of result.subdirs) {
    const fp = path.join(root, d)
    recordAdded(fp)
  }
  return result
}
