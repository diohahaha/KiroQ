/**
 * 图片库文件打开服务。
 * viewerPath 由渲染进程传入（渲染进程从 useSettingsStore 读取 imageViewerPath/ebookViewerPath），
 * 主进程不读取 localStorage（读不到），所以这里不再自己查设置。
 * viewerPath 为空 → 退回 shell.openPath（系统默认关联程序）。
 */
import { shell } from 'electron'
import { execFile } from 'child_process'
import { recordOpened } from './imageStore'

export async function openImageResource(filePath: string, viewerPath: string | null): Promise<boolean> {
  recordOpened(filePath)

  if (viewerPath) {
    return new Promise((resolve) => {
      execFile(viewerPath, [filePath], (err) => {
        if (err) {
          console.warn('[imageOpener] 指定程序打开失败，退回系统默认:', err.message)
          shell.openPath(filePath).then(errMsg => resolve(!errMsg)).catch(() => resolve(false))
        } else {
          resolve(true)
        }
      })
    })
  }

  const errMsg = await shell.openPath(filePath)
  return !errMsg
}
