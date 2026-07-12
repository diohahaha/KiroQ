/**
 * 图片库扫描服务：遍历目录，一次 scandir 返回子目录 + 图片/压缩包/电子书文件。
 * 结构对齐 electron/services/scanner.ts（视频库），独立实现不共用状态。
 */
import * as fs from 'fs'
import * as path from 'path'
import type { ImageScanResult } from '../../shared/types'
import { classifyImageResource } from '../../shared/types'
import { getImageData, recordImageAdded } from './imageStore'

export function scanImageFolder(folder: string): ImageScanResult {
  const subdirs: string[] = []
  const files: string[] = []
  try {
    const entries = fs.readdirSync(folder, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        subdirs.push(entry.name)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (classifyImageResource(ext)) files.push(entry.name)
      }
    }
  } catch (e) {
    console.warn(`[imageScanner] scanImageFolder(${folder}):`, e)
  }
  const naturalSort = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  subdirs.sort(naturalSort)
  files.sort(naturalSort)
  return { subdirs, files }
}

/** 判断是否为有效图片文件夹（自动过滤：空文件夹 + 自定义关键词，不用视频库那套固定词表） */
export function isValidImageFolder(folderPath: string): boolean {
  const data = getImageData()
  const name = path.basename(folderPath).toLowerCase().trim()

  if (data.filterKeywords) {
    const kws = data.filterKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    if (kws.includes(name)) return false
  }

  if (data.autoFilterEmpty) {
    const { subdirs, files } = scanImageFolder(folderPath)
    if (files.length === 0 && subdirs.length === 0) return false
  }
  return true
}

/** 扫描图片库根目录并记录首次出现时间 */
export function scanImageLibraryRoot(root: string): ImageScanResult {
  const result = scanImageFolder(root)
  for (const d of result.subdirs) {
    const fp = path.join(root, d)
    recordImageAdded(fp)
  }
  return result
}

/**
 * 找文件夹内可用作封面的候选文件列表（用于文件夹卡片本身的封面）。
 * 文件夹里没有直接文件时，往第一层子文件夹（按自然顺序）找，最多往下找 3 层，
 * 避免有的画集是「作品/Vol1/xxx.jpg」这种多套一层目录的情况找不到封面。
 *
 * 返回多个候选（而不是只返回第一个），是因为压缩包/epub 有可能解压失败
 * （加密、损坏、格式不支持），如果只给一个候选、这一个刚好解不开，
 * 整个文件夹封面就直接放弃了——明明后面的文件可能完全没问题。
 * 调用方（imageLibrary.ts）应该按顺序逐个尝试，直到有一个成功。
 *
 * 'other' 类型（未知格式、没有封面提取器）不作为候选，跳过。
 */
export function findRepresentativeFiles(folderPath: string, limit = 6, maxDepth = 3): string[] {
  const results: string[] = []
  function walk(folder: string, depth: number) {
    if (depth <= 0 || results.length >= limit) return
    const { subdirs, files } = scanImageFolder(folder)
    for (const f of files) {
      if (results.length >= limit) return
      const ext = path.extname(f).toLowerCase()
      if (classifyImageResource(ext) === 'other') continue
      results.push(path.join(folder, f))
    }
    for (const d of subdirs) {
      if (results.length >= limit) return
      walk(path.join(folder, d), depth - 1)
    }
  }
  walk(folderPath, maxDepth)
  return results
}
