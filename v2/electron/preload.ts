/**
 * Preload script：contextBridge 暴露 window.api
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { AppData, AppSettings, AnimeFolder, ScanResult, ContextMenuItem } from '../shared/types'

const api = {
  // Data
  getData: (): Promise<AppData> =>
    ipcRenderer.invoke(IPC.DATA_GET),
  setRoot: (root: string): Promise<AppData> =>
    ipcRenderer.invoke(IPC.DATA_SET_ROOT, root),
  updateMeta: (folderPath: string, partial: Partial<AnimeFolder>): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_UPDATE_META, folderPath, partial),
  markWatched: (videoPath: string, folderPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_MARK_WATCHED, videoPath, folderPath),
  clearWatched: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_CLEAR_WATCHED, folderPath),
  togglePin: (folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.DATA_TOGGLE_PIN, folderPath),
  toggleHide: (folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.DATA_TOGGLE_HIDE, folderPath),
  toggleAllPin: (paths: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_TOGGLE_ALL_PIN, paths),
  toggleAllHide: (paths: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_TOGGLE_ALL_HIDE, paths),
  batchClear: (paths: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_BATCH_CLEAR, paths),
  batchSetStatus: (paths: string[], status: string): Promise<void> =>
    ipcRenderer.invoke(IPC.DATA_BATCH_STATUS, paths, status),

  // Library（支持扫描任意目录）
  scanFolder: (folder: string): Promise<ScanResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_SCAN, folder),
  getDuration: (filePath: string): Promise<any> =>
    ipcRenderer.invoke(IPC.LIBRARY_GET_DURATION, filePath),
  getThumbnail: (videoPath: string, w: number, h: number): Promise<string | null> =>
    ipcRenderer.invoke(IPC.LIBRARY_GET_THUMBNAIL, videoPath, w, h),
  // 额外数据操作
  setWatched: (folderPath: string, videos: string[]): Promise<void> =>
    ipcRenderer.invoke('data:setWatched', folderPath, videos),

  // Settings
  getSettings: (): Promise<AppSettings | null> =>
    ipcRenderer.invoke(IPC.SETTINGS_GET),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SETTINGS_PICK_FOLDER),
  pickPlayer: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SETTINGS_PICK_PLAYER),
  pickImage: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SETTINGS_PICK_IMAGE),

  // Player
  launchPlayer: (videoPath: string, folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYER_LAUNCH, videoPath, folderPath),
  onPlayerTitleChanged: (cb: (title: string) => void): (() => void) => {
    const h = (_e: any, title: string) => cb(title)
    ipcRenderer.on(IPC.PLAYER_TITLE_CHANGED, h)
    return () => ipcRenderer.removeListener(IPC.PLAYER_TITLE_CHANGED, h)
  },
  onPlayerClosed: (cb: () => void): (() => void) => {
    const h = () => cb()
    ipcRenderer.on('player:closed', h)
    return () => ipcRenderer.removeListener('player:closed', h)
  },

  // Bangumi
  bangumiSearch: (keyword: string): Promise<any[]> =>
    ipcRenderer.invoke(IPC.BANGUMI_SEARCH, keyword),
  bangumiGetSubject: (subjectId: number): Promise<any> =>
    ipcRenderer.invoke(IPC.BANGUMI_GET_SUBJECT, subjectId),
  bangumiDownloadCover: (url: string, saveDir: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.BANGUMI_DOWNLOAD_COVER, url, saveDir),
  genericFetchJson: (url: string): Promise<any> =>
    ipcRenderer.invoke('generic:fetchJson', url),

  // Context Menu
  // Shell
  openFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SHELL_OPEN_FOLDER, filePath),
  deleteFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SHELL_DELETE_FILE, filePath),

  // Context Menu
  showContextMenu: (items: ContextMenuItem[]): Promise<string | null> =>
    ipcRenderer.invoke(IPC.WINDOW_CONTEXT_MENU, items),
}

contextBridge.exposeInMainWorld('api', api)
export type KiroqApi = typeof api
