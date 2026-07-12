import { create } from 'zustand'
import type { ImageAppData, ImageFolder, ImageTagDef } from '@shared/types'
import { DEFAULT_IMAGE_APP_DATA, classifyImageResource } from '@shared/types'
import { useSettingsStore } from './settingsStore'

// 注意：window.api.image* 这些方法需要在 electron/preload.ts 里通过 contextBridge 暴露，
// 对应 IPC 通道见 shared/types.ts 的 IPC.IMAGE_* 常量。参考现有 window.api.togglePin 等的写法照抄即可。
interface ImageLibraryState {
  data: ImageAppData
  loaded: boolean

  load: () => Promise<void>
  setRoot: (root: string) => Promise<void>
  scanFolder: (folderPath: string) => Promise<{ subdirs: string[]; files: string[] }>
  updateMeta: (folderPath: string, partial: Partial<ImageFolder>) => Promise<void>

  togglePin: (folderPath: string) => Promise<void>
  toggleHide: (folderPath: string) => Promise<void>
  batchTogglePin: (paths: string[]) => Promise<void>
  batchToggleHide: (paths: string[]) => Promise<void>
  batchDelete: (paths: string[]) => Promise<void>

  setFolderTags: (folderPath: string, tags: string[]) => Promise<void>
  setFileTags: (filePath: string, tags: string[]) => Promise<void>
  toggleFolderWatched: (folderPath: string) => Promise<void>
  toggleFileWatched: (filePath: string, folderPath: string) => Promise<void>

  saveTagDefs: (defs: ImageTagDef[]) => Promise<void>
  saveFilter: (partial: Partial<Pick<ImageAppData, 'autoFilterEmpty' | 'filterKeywords' | 'typeFilter'>>) => Promise<void>
  setSort: (sortKey: ImageAppData['sortKey'], sortDesc: boolean) => Promise<void>

  getCover: (filePath: string) => Promise<string | null>
  openFile: (filePath: string) => Promise<boolean>
}

export const useImageLibraryStore = create<ImageLibraryState>((set, get) => ({
  data: DEFAULT_IMAGE_APP_DATA,
  loaded: false,

  load: async () => {
    const data = await window.api.imageGetData()
    set({ data, loaded: true })
  },

  setRoot: async (root) => {
    const data = await window.api.imageSetRoot(root)
    set({ data })
  },

  scanFolder: async (folderPath) => {
    return window.api.imageScanFolder(folderPath)
  },

  updateMeta: async (folderPath, partial) => {
    await window.api.imageUpdateMeta(folderPath, partial)
    set(s => ({
      data: {
        ...s.data,
        folderMeta: {
          ...s.data.folderMeta,
          [folderPath]: { ...(s.data.folderMeta[folderPath] as ImageFolder), ...partial },
        },
      },
    }))
  },

  togglePin: async (folderPath) => {
    await window.api.imageTogglePin(folderPath)
    set(s => {
      const has = s.data.pinned.includes(folderPath)
      return { data: { ...s.data, pinned: has ? s.data.pinned.filter(p => p !== folderPath) : [...s.data.pinned, folderPath] } }
    })
  },

  toggleHide: async (folderPath) => {
    await window.api.imageToggleHide(folderPath)
    set(s => {
      const has = s.data.hidden.includes(folderPath)
      return { data: { ...s.data, hidden: has ? s.data.hidden.filter(p => p !== folderPath) : [...s.data.hidden, folderPath] } }
    })
  },

  batchTogglePin: async (paths) => {
    await window.api.imageBatchTogglePin(paths)
    await get().load()
  },

  batchToggleHide: async (paths) => {
    await window.api.imageBatchToggleHide(paths)
    await get().load()
  },

  batchDelete: async (paths) => {
    await window.api.imageBatchDelete(paths)
    await get().load()
  },

  setFolderTags: async (folderPath, tags) => {
    await window.api.imageSetFolderTags(folderPath, tags)
    set(s => ({
      data: {
        ...s.data,
        folderMeta: {
          ...s.data.folderMeta,
          [folderPath]: { ...(s.data.folderMeta[folderPath] as ImageFolder), tags },
        },
      },
    }))
  },

  setFileTags: async (filePath, tags) => {
    await window.api.imageSetFileTags(filePath, tags)
    set(s => ({ data: { ...s.data, fileTags: { ...s.data.fileTags, [filePath]: tags } } }))
  },

  toggleFolderWatched: async (folderPath) => {
    await window.api.imageToggleFolderWatched(folderPath)
    set(s => {
      const has = s.data.folderWatched.includes(folderPath)
      return { data: { ...s.data, folderWatched: has ? s.data.folderWatched.filter(p => p !== folderPath) : [...s.data.folderWatched, folderPath] } }
    })
  },

  toggleFileWatched: async (filePath, folderPath) => {
    await window.api.imageToggleFileWatched(filePath, folderPath)
    set(s => {
      const list = s.data.fileWatched[folderPath] || []
      const has = list.includes(filePath)
      const next = has ? list.filter(p => p !== filePath) : [...list, filePath]
      return { data: { ...s.data, fileWatched: { ...s.data.fileWatched, [folderPath]: next } } }
    })
  },

  saveTagDefs: async (defs) => {
    await window.api.imageSaveTagDefs(defs)
    set(s => ({ data: { ...s.data, tagDefs: defs } }))
  },

  saveFilter: async (partial) => {
    await window.api.imageSaveFilter(partial)
    set(s => ({ data: { ...s.data, ...partial } }))
  },

  setSort: async (sortKey, sortDesc) => {
    await window.api.imageSetSort(sortKey, sortDesc)
    set(s => ({ data: { ...s.data, sortKey, sortDesc } }))
  },

  getCover: async (filePath) => {
    return window.api.imageGetCover(filePath)
  },

  openFile: async (filePath) => {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    const kind = classifyImageResource(ext)
    const settings = useSettingsStore.getState()
    const viewerPath = kind === 'ebook' ? settings.ebookViewerPath : settings.imageViewerPath
    return window.api.imageOpenFile(filePath, viewerPath)
  },
}))
