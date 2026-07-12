/**
 * Settings IPC handlers
 */
import { app, shell } from 'electron'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { IPC } from '../../shared/types'

export function registerSettingsIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.SETTINGS_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择动漫根目录',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.SETTINGS_PICK_PLAYER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择播放器',
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.SETTINGS_PICK_IMAGE, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择封面图片',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── 图片库：图片/压缩包查看器 + 电子书阅读器 ──
  ipcMain.handle(IPC.SETTINGS_PICK_IMAGE_VIEWER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片/压缩包查看器',
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.SETTINGS_PICK_EBOOK_VIEWER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择电子书阅读器',
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    const fp = path.join(app.getPath('userData'), 'kiroq-settings.json')
    try {
      if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8'))
    } catch { /* ignore */ }
    return null
  })

  // 在资源管理器打开文件夹
  ipcMain.handle(IPC.SHELL_OPEN_FOLDER, async (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // 彻底删除文件
  ipcMain.handle(IPC.SHELL_DELETE_FILE, async (_e, filePath: string) => {
    // 先弹确认框
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '确认删除',
      message: '确定将此文件移入回收站？',
      detail: filePath,
      buttons: ['取消', '确定删除'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response === 1) {
      try { await shell.trashItem(filePath); return true }
      catch { try { const stat = fs.statSync(filePath); if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true }); else fs.unlinkSync(filePath); return true } catch { return false } }
    }
    return false
  })
}
