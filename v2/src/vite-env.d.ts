/// <reference types="vite/client" />

import type { KiroqApi } from '../electron/preload'

declare global {
  interface Window {
    api: KiroqApi & {
      // 额外暴露的方法
      scanFolder: (folder: string) => Promise<{ subdirs: string[]; videos: string[] }>
      setRoot: (root: string) => Promise<any>
      togglePin: (folderPath: string) => Promise<boolean>
      toggleHide: (folderPath: string) => Promise<boolean>
      bangumiSearch: (keyword: string) => Promise<any[]>
      bangumiGetSubject: (subjectId: number) => Promise<any>
      bangumiDownloadCover: (url: string, saveDir: string) => Promise<string | null>
      pickImage: () => Promise<string | null>
      genericFetchJson: (url: string) => Promise<any>
      // 视频库进度条修复：递归统计某文件夹（含子文件夹）视频总数
      countVideos: (folderPath: string) => Promise<number>
    }
  }
}
