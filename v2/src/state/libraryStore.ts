/**
 * 番剧库状态 — 匹配旧版 DataManager 结构
 */
import { create } from 'zustand'
import type { AppData, AnimeFolder, ScanResult, SortKey } from '@shared/types'

interface LibraryState {
  data: AppData
  loaded: boolean

  load: () => Promise<void>
  refresh: () => Promise<void>

  setRoot: (root: string) => Promise<void>
  updateMeta: (fp: string, partial: Partial<AnimeFolder>) => Promise<void>
  markWatched: (videoPath: string, folderPath: string) => Promise<void>
  clearWatched: (folderPath: string) => Promise<void>
  togglePin: (fp: string) => Promise<boolean>
  toggleHide: (fp: string) => Promise<boolean>

  // 批量操作
  toggleAllPin: (paths: string[]) => Promise<void>
  toggleAllHide: (paths: string[]) => Promise<void>
  batchClear: (paths: string[]) => Promise<void>
  batchSetStatus: (paths: string[], status: string) => Promise<void>

  // 排序
  setSort: (key: SortKey, desc: boolean) => void

  // 扫描
  scanFolder: (root: string) => Promise<ScanResult>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  data: {
    version: 1, root: '', watched: {}, folderMeta: {},
    sortKey: 'name', sortDesc: false,
    lastWatchedTime: {}, addedTime: {}, pinned: [], hidden: [],
    videoDurations: {},
  },
  loaded: false,

  load: async () => {
    const data = await window.api.getData()
    set({ data, loaded: true })
  },

  refresh: async () => {
    const data = await window.api.getData()
    set({ data })
  },

  setRoot: async (root: string) => {
    const data = await window.api.setRoot(root)
    set({ data })
  },

  updateMeta: async (fp, partial) => {
    await window.api.updateMeta(fp, partial)
    get().refresh()
  },

  markWatched: async (videoPath, folderPath) => {
    await window.api.markWatched(videoPath, folderPath)
    get().refresh()
  },

  clearWatched: async (folderPath) => {
    await window.api.clearWatched(folderPath)
    get().refresh()
  },

  togglePin: async (fp) => {
    const result = await window.api.togglePin(fp)
    get().refresh()
    return result
  },

  toggleHide: async (fp) => {
    const result = await window.api.toggleHide(fp)
    get().refresh()
    return result
  },

  toggleAllPin: async (paths) => {
    await window.api.toggleAllPin(paths)
    get().refresh()
  },

  toggleAllHide: async (paths) => {
    await window.api.toggleAllHide(paths)
    get().refresh()
  },

  batchClear: async (paths) => {
    await window.api.batchClear(paths)
    get().refresh()
  },

  batchSetStatus: async (paths, status) => {
    await window.api.batchSetStatus(paths, status)
    get().refresh()
  },

  setSort: (key, desc) => {
    set(s => ({
      data: { ...s.data, sortKey: key, sortDesc: desc },
    }))
  },

  scanFolder: async (root) => {
    return window.api.scanFolder(root)
  },
}))
