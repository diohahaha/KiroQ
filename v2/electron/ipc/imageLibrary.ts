/**
 * Image Library IPC handlers
 * 镜像 electron/ipc/library.ts，但全部走独立的 imageStore/imageScanner/imageCover。
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { IPC, classifyImageResource } from '../../shared/types'
import type { ImageAppData, ImageFolder, ImageTagDef } from '../../shared/types'
import {
  getImageData, setImageRoot, setImageMeta,
  toggleImagePin, toggleImageHide,
  batchToggleImagePin, batchToggleImageHide, purgeImageReferences,
  setFolderTags, setFileTags,
  toggleFolderWatched, toggleFileWatched,
  saveTagDefs, saveImageFilter, setImageSort,
} from '../services/imageStore'
import { scanImageLibraryRoot, scanImageFolder, findRepresentativeFiles } from '../services/imageScanner'
import { generateImageCover, clearFailedCache, MAX_ARCHIVE_SIZE } from '../services/imageCover'
import { generateThumbnail, thumbnailExists, thumbnailPath } from '../services/thumbnail'
import { generatePdfCover } from '../services/pdfCover'
import { coverQueue, pdfQueue } from '../services/taskQueue'
import { openImageResource } from '../services/imageOpener'
import { getLogFilePath } from '../services/coverErrorLog'
import * as path from 'path'
import type { ImageResourceKind } from '../../shared/types'

/**
 * 统一的封面调度：按类型分流。
 * video 复用视频库现成的 ffmpeg 缩略图生成（走独立进程，不占用图片库那条
 * zip/epub 解压限流队列，两者互不影响）；other 没有封面提取器，直接跳过。
 * force=true：无视体积上限、无视失败记忆，强制重新尝试（"获取超大文件封面"按钮用）。
 */
async function generateCoverForAnyKind(filePath: string, kind: ImageResourceKind, hash: string, force = false): Promise<string | null> {
  if (kind === 'other') return null

  // 已经有缓存的封面文件，直接返回，不用进限流队列排队。
  // 之前这个检查分散写在每个分支里、而且压缩包/图片那条路径完全没做这个检查，
  // 导致哪怕文件早就有封面了，每次进文件夹还是要陪着一起排队等 coverQueue 的位置——
  // 文件夹里文件一多，光是"确认已有封面还在"这一步就会攒出没必要的延迟。
  // 统一提到最前面做一次，对所有类型都生效。
  const output = thumbnailPath(hash)
  if (!force && thumbnailExists(hash) && fs.statSync(output).size > 0) return hash

  if (kind === 'video') {
    // 尺寸和 imageCover.ts 的 THUMBNAIL_MAX_DIM(600) 对齐，保持卡片封面
    // 154:200 差不多的比例，兼顾缩放滑条拉到最大 + 高分屏不糊
    const result = await generateThumbnail(filePath, hash, 460, 600)
    return result ? hash : null
  }
  // PDF 归在 'ebook' 类型里（和 epub/txt 共用一个筛选分类），但渲染方式完全不同：
  // 走 pdftoppm 独立进程，不走下面 generateImageCover 那套同步 zip 解压逻辑。
  if (kind === 'ebook' && filePath.toLowerCase().endsWith('.pdf')) {
    const ok = await pdfQueue.run(() => generatePdfCover(filePath, output, force))
    return ok ? hash : null
  }
  const result = await coverQueue.run(() => generateImageCover(filePath, kind, hash, force))
  return result ? hash : null
}

export function registerImageLibraryIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.IMAGE_DATA_GET, async (): Promise<ImageAppData> => {
    return getImageData()
  })

  ipcMain.handle(IPC.IMAGE_DATA_SET_ROOT, async (_e, root: string) => {
    setImageRoot(root)
    return getImageData()
  })

  ipcMain.handle(IPC.IMAGE_DATA_UPDATE_META, async (_e, folderPath: string, partial: Partial<ImageFolder>) => {
    setImageMeta(folderPath, partial)
  })

  ipcMain.handle(IPC.IMAGE_DATA_TOGGLE_PIN, async (_e, folderPath: string) => toggleImagePin(folderPath))
  ipcMain.handle(IPC.IMAGE_DATA_TOGGLE_HIDE, async (_e, folderPath: string) => toggleImageHide(folderPath))
  ipcMain.handle(IPC.IMAGE_DATA_TOGGLE_ALL_PIN, async (_e, paths: string[]) => batchToggleImagePin(paths))
  ipcMain.handle(IPC.IMAGE_DATA_TOGGLE_ALL_HIDE, async (_e, paths: string[]) => batchToggleImageHide(paths))

  ipcMain.handle(IPC.IMAGE_DATA_SET_FOLDER_TAGS, async (_e, folderPath: string, tags: string[]) => {
    setFolderTags(folderPath, tags)
  })
  ipcMain.handle(IPC.IMAGE_DATA_SET_FILE_TAGS, async (_e, filePath: string, tags: string[]) => {
    setFileTags(filePath, tags)
  })
  ipcMain.handle(IPC.IMAGE_DATA_TOGGLE_FOLDER_WATCHED, async (_e, folderPath: string) => toggleFolderWatched(folderPath))
  ipcMain.handle(IPC.IMAGE_DATA_TOGGLE_FILE_WATCHED, async (_e, filePath: string, folderPath: string) =>
    toggleFileWatched(filePath, folderPath))

  ipcMain.handle(IPC.IMAGE_DATA_SAVE_TAG_DEFS, async (_e, defs: ImageTagDef[]) => saveTagDefs(defs))
  ipcMain.handle(IPC.IMAGE_DATA_SAVE_FILTER, async (_e, partial: Partial<ImageAppData>) =>
    saveImageFilter(partial as any))

  ipcMain.handle('imageData:setSort', async (_e, sortKey: ImageAppData['sortKey'], sortDesc: boolean) => {
    setImageSort(sortKey, sortDesc)
  })

  // 批量删除：文件夹或文件路径混合都行，磁盘物理删除 + 清理引用数据
  ipcMain.handle(IPC.IMAGE_DATA_BATCH_DELETE, async (_e, paths: string[]) => {
    if (paths.length === 0) return []
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '确认删除',
      message: `确定删除选中的 ${paths.length} 项？`,
      detail: '文件会移入回收站，文件夹会被永久删除，此操作不可撤销。',
      buttons: ['取消', '确定删除'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response !== 1) return []

    const results: string[] = []
    for (const p of paths) {
      try {
        const stat = fs.statSync(p)
        if (stat.isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true })
        } else {
          await shell.trashItem(p) // 走回收站，比 unlink 安全
        }
        results.push(p)
      } catch (e) {
        console.warn('[imageLibrary] batchDelete failed:', p, e)
      }
    }
    purgeImageReferences(results)
    return results
  })

  ipcMain.handle(IPC.IMAGE_LIBRARY_SCAN, async (_e, root: string) => {
    return scanImageLibraryRoot(root)
  })

  // 详情页扫描单个文件夹（子文件夹 + 图片/压缩包/电子书文件）
  ipcMain.handle('imageLibrary:scanFolder', async (_e, folderPath: string) => {
    return scanImageFolder(folderPath)
  })

  // 生成/读取封面：图片直接读原图，压缩包/epub 提取首图，视频复用 ffmpeg 缩略图，
  // 其他未知类型直接跳过（前端通用文件图标兜底，不会因为没封面就不显示这个文件）。
  ipcMain.handle(IPC.IMAGE_LIBRARY_GET_COVER, async (_e, filePath: string) => {
    const ext = path.extname(filePath)
    const kind = classifyImageResource(ext)
    const hash = crypto.createHash('md5').update(filePath).digest('hex')
    return generateCoverForAnyKind(filePath, kind, hash)
  })

  // 打开文件：viewerPath 由前端传入(渲染进程读 useSettingsStore)，为空则系统默认，同时记录最近打开时间
  ipcMain.handle(IPC.IMAGE_LIBRARY_OPEN_FILE, async (_e, filePath: string, viewerPath: string | null) => {
    return openImageResource(filePath, viewerPath)
  })

  // 打开封面失败日志所在文件夹（日志文件本身可能还不存在，没失败过就没有这个文件，
  // 用 showItemInFolder 打开所在目录比直接打开文件更稳妥）
  ipcMain.handle(IPC.IMAGE_LIBRARY_OPEN_ERROR_LOG, async () => {
    shell.showItemInFolder(getLogFilePath())
  })

  // 清空缩略图缓存目录（视频缩略图 + 图片库封面共用同一个缓存目录）。
  // 用来在改了缩略图生成尺寸之后，让所有缓存重新按新尺寸生成一遍，
  // 不然旧缓存会一直是改之前的小尺寸，放大滑条拉大看还是糊的。
  ipcMain.handle('imageLibrary:clearThumbnailCache', async () => {
    const dir = path.dirname(thumbnailPath('probe'))
    let deleted = 0
    try {
      const files = fs.readdirSync(dir)
      for (const f of files) {
        try { fs.unlinkSync(path.join(dir, f)); deleted++ } catch { /* 单个文件删不掉就跳过 */ }
      }
    } catch { /* 目录本来就不存在，忽略 */ }

    // 图片库文件夹记的封面 hash 引用也要一起清掉，不然会指向已经被删除的缓存文件，
    // 卡片直接显示裂图，要等下次手动"重新获取封面"才会恢复——干脆这里一并清空，
    // 下次进首页/详情页会自动重新探测生成。
    const data = getImageData()
    for (const fp of Object.keys(data.folderMeta)) {
      if (data.folderMeta[fp].cover) setImageMeta(fp, { cover: '' })
    }

    return { deleted }
  })

  // 找出这个文件夹里"因为超过体积上限被自动跳过"的候选文件（压缩包/电子书 且 超过阈值 且 还没封面缓存），
  // 给"⚡ 获取超大文件封面"按钮用，只返回文件名列表，真正生成封面走下面的 regenerateCover 逐个调用。
  ipcMain.handle('imageLibrary:getOversizedFiles', async (_e, folderPath: string) => {
    const { files } = scanImageFolder(folderPath)
    const result: string[] = []
    for (const f of files) {
      const ext = path.extname(f)
      const kind = classifyImageResource(ext)
      if (kind !== 'archive' && kind !== 'ebook') continue
      const filePath = path.join(folderPath, f)
      let size = 0
      try { size = fs.statSync(filePath).size } catch { continue }
      if (size <= MAX_ARCHIVE_SIZE) continue
      const hash = crypto.createHash('md5').update(filePath).digest('hex')
      if (thumbnailExists(hash)) continue // 已经有封面了，不用重新处理
      result.push(f)
    }
    return result
  })

  // 强制重新获取单个文件的封面：无视体积上限、无视失败记忆，清掉旧缓存重新来一次。
  // "获取超大文件封面"按钮和右键菜单"重新获取封面"都走这个。
  ipcMain.handle('imageLibrary:regenerateCover', async (_e, filePath: string) => {
    const ext = path.extname(filePath)
    const kind = classifyImageResource(ext)
    const hash = crypto.createHash('md5').update(filePath).digest('hex')
    try { fs.unlinkSync(thumbnailPath(hash)) } catch { /* 本来就没有缓存文件，忽略 */ }
    clearFailedCache(filePath)
    return generateCoverForAnyKind(filePath, kind, hash, true)
  })

  // 文件夹卡片强制重新获取封面：清掉旧记录，重新走候选查找+强制重试流程
  ipcMain.handle('imageLibrary:regenerateFolderCover', async (_e, folderPath: string) => {
    const data = getImageData()
    const oldHash = data.folderMeta[folderPath]?.cover
    if (oldHash) { try { fs.unlinkSync(thumbnailPath(oldHash)) } catch { /* 忽略 */ } }
    setImageMeta(folderPath, { cover: '' })

    const candidates = findRepresentativeFiles(folderPath, 6)
    for (const rep of candidates) {
      const ext = path.extname(rep)
      const kind = classifyImageResource(ext)
      const hash = crypto.createHash('md5').update(rep).digest('hex')
      try { fs.unlinkSync(thumbnailPath(hash)) } catch { /* 忽略 */ }
      clearFailedCache(rep)
      const result = await generateCoverForAnyKind(rep, kind, hash, true)
      if (result) {
        setImageMeta(folderPath, { cover: hash })
        return hash
      }
    }
    return null
  })

  // 文件夹卡片本身的封面：优先用已存的 folderMeta.cover，没有则挑几个候选文件
  // 依次尝试（有的解不开就换下一个），成功了就持久化，全部失败才真的没有封面。
  ipcMain.handle('imageLibrary:getFolderCover', async (_e, folderPath: string) => {
    const data = getImageData()
    const existing = data.folderMeta[folderPath]?.cover
    if (existing) return existing

    const candidates = findRepresentativeFiles(folderPath, 6)
    for (const rep of candidates) {
      const ext = path.extname(rep)
      const kind = classifyImageResource(ext)
      const hash = crypto.createHash('md5').update(rep).digest('hex')
      const result = await generateCoverForAnyKind(rep, kind, hash)
      if (result) {
        setImageMeta(folderPath, { cover: hash })
        return hash
      }
    }
    return null
  })
}
