/**
 * Library + Data IPC handlers
 */
import * as crypto from 'crypto'
import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/types'
import type { AppData, AnimeFolder } from '../../shared/types'
import {
  getData, setMeta, setRoot,
  markWatched, clearWatched, togglePin, toggleHide,
  getDuration, setDuration, setWatched,
  batchTogglePin, batchToggleHide, batchClearWatched, batchSetStatus,
} from '../services/store'
import { scanLibraryRoot } from '../services/scanner'
import { probeVideo } from '../services/ffprobe'
import { generateThumbnail, thumbnailExists, thumbnailPath } from '../services/thumbnail'

export function registerLibraryIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.DATA_GET, async (): Promise<AppData> => {
    return getData()
  })

  ipcMain.handle(IPC.DATA_SET_ROOT, async (_e, root: string) => {
    setRoot(root)
    return getData()
  })

  ipcMain.handle(IPC.DATA_UPDATE_META, async (_e, folderPath: string, partial: Partial<AnimeFolder>) => {
    setMeta(folderPath, partial)
  })

  ipcMain.handle(IPC.DATA_MARK_WATCHED, async (_e, videoPath: string, folderPath: string) => {
    markWatched(videoPath, folderPath)
  })

  ipcMain.handle('data:setWatched', async (_e, folderPath: string, videos: string[]) => {
    setWatched(folderPath, videos)
  })

  ipcMain.handle(IPC.DATA_CLEAR_WATCHED, async (_e, folderPath: string) => {
    clearWatched(folderPath)
  })

  ipcMain.handle(IPC.DATA_TOGGLE_PIN, async (_e, folderPath: string) => {
    return togglePin(folderPath)
  })

  ipcMain.handle(IPC.DATA_TOGGLE_HIDE, async (_e, folderPath: string) => {
    return toggleHide(folderPath)
  })

  ipcMain.handle(IPC.DATA_TOGGLE_ALL_PIN, async (_e, paths: string[]) => {
    batchTogglePin(paths)
  })

  ipcMain.handle(IPC.DATA_TOGGLE_ALL_HIDE, async (_e, paths: string[]) => {
    batchToggleHide(paths)
  })

  ipcMain.handle(IPC.DATA_BATCH_CLEAR, async (_e, paths: string[]) => {
    batchClearWatched(paths)
  })

  ipcMain.handle(IPC.DATA_BATCH_STATUS, async (_e, paths: string[], status: string) => {
    batchSetStatus(paths, status)
  })

  ipcMain.handle(IPC.LIBRARY_SCAN, async (_e, root: string) => {
    return scanLibraryRoot(root)
  })

  ipcMain.handle(IPC.LIBRARY_GET_DURATION, async (_e, filePath: string) => {
    const cached = getDuration(filePath)
    if (cached != null) return cached
    const result = await probeVideo(filePath)
    if (result.durationSec != null) {
      setDuration(filePath, result.durationSec)
    }
    return result
  })

  // 生成缩略图（异步触发，不阻塞返回）
  ipcMain.handle(IPC.LIBRARY_GET_THUMBNAIL, async (_e, videoPath: string, w: number, h: number) => {
    const hash = crypto.createHash('md5').update(`${videoPath}|${w}|${h}`).digest('hex')
    if (thumbnailExists(hash)) return hash
    // 后台生成，不等待
    generateThumbnail(videoPath, hash, w, h).then(p => {
      if (p) mainWindow?.webContents.send('thumbnail:ready', hash)
    })
    return hash // 返回 hash，前端用 kiroq://thumbnail/{hash} 加载
  })
}
