/**
 * Electron Main Process — 装配所有服务
 */
import { app, BrowserWindow, protocol, Menu, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initStore, flush, getData, save } from './services/store'
import { migrateOldData } from './services/migrateOldData'
import { registerLibraryIpc } from './ipc/library'
import { registerSettingsIpc } from './ipc/settings'
import { registerPlayerIpc } from './ipc/player'
import { registerBangumiIpc } from './ipc/bangumi'
import { registerImageLibraryIpc } from './ipc/imageLibrary'
import { flushImageStore } from './services/imageStore'
import { thumbnailPath } from './services/thumbnail'
import { IPC } from '../shared/types'

// 禁止重复启动
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) { app.quit() } else {
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, '..', 'build', 'icon.ico')
    : path.join(process.cwd(), 'build', 'icon.ico')

  // 恢复上一次窗口位置/大小
  const statePath = path.join(app.getPath('userData'), 'window-state.json')
  let savedBounds: any = null
  try {
    if (fs.existsSync(statePath)) savedBounds = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  } catch {}

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 980,
    height: savedBounds?.height || 700,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 700, minHeight: 500,
    icon: iconPath, title: 'KiroQ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  })

  // 关闭时保存窗口状态
  let geomTimer: ReturnType<typeof setTimeout> | null = null
  const saveWindowState = () => {
    if (!mainWindow || mainWindow.isMinimized()) return
    const [x, y] = mainWindow.getPosition()
    const [w, h] = mainWindow.getSize()
    try {
      fs.writeFileSync(statePath, JSON.stringify({ x, y, width: w, height: h }))
    } catch {}
  }
  mainWindow.on('resize', () => {
    if (geomTimer) clearTimeout(geomTimer)
    geomTimer = setTimeout(saveWindowState, 800)
  })
  mainWindow.on('move', () => {
    if (geomTimer) clearTimeout(geomTimer)
    geomTimer = setTimeout(saveWindowState, 800)
  })

  // 右键菜单 IPC（支持一层子菜单，目前只有图片库"标记标签"用到）
  ipcMain.handle(IPC.WINDOW_CONTEXT_MENU, async (_event, items) => {
    return new Promise<string | null>((resolve) => {
      const buildTemplate = (list: any[]): Electron.MenuItemConstructorOptions[] =>
        list.map((item: any) => {
          if (item.type === 'separator') return { type: 'separator' as const }
          const base: Electron.MenuItemConstructorOptions = {
            label: item.label,
            enabled: item.enabled !== false,
          }
          if (item.submenu && item.submenu.length > 0) {
            base.submenu = buildTemplate(item.submenu)
          } else {
            base.type = item.type === 'checkbox' ? ('checkbox' as const) : ('normal' as const)
            base.checked = item.checked
            base.click = () => resolve(item.id)
          }
          return base
        })
      Menu.buildFromTemplate(buildTemplate(items)).popup({
        window: mainWindow!,
        callback: () => resolve(null),
      })
    })
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.kiroq.app')
  Menu.setApplicationMenu(null)  // 去掉默认英文菜单栏
  initStore()

  // 迁移旧数据
  const data = getData()
  if (!data.root || Object.keys(data.folderMeta).length === 0) {
    const result = migrateOldData()
    if (result.data && (result.data.root || Object.keys(result.data.folderMeta).length > 0)) {
      // 合并迁移数据到 store（直接修改内存对象然后保存）
      const current = getData()
      Object.assign(current, result.data)
      save()
      console.log(`[main] migrated ${result.migrated} entries from old data`)
    }
  }

  // 注册 kiroq:// 协议（缩略图 + 封面图）
  // 注意：图片库的封面（图片原图/zip首图/epub封面）也统一走 thumbnailPath() 写盘，
  // 复用同一个 kiroq://thumbnail/{hash} 协议，不需要新增协议分支。
  protocol.registerFileProtocol('kiroq', (request, callback) => {
    const raw = decodeURIComponent(request.url.replace('kiroq://', ''))
    const url = raw.split('?')[0] // 去掉 query 参数（缓存破坏用）
    // 缩略图: kiroq://thumbnail/{hash}
    if (url.startsWith('thumbnail/')) {
      const hash = url.slice('thumbnail/'.length)
      const p = thumbnailPath(hash)
      if (p && p.includes('thumbnails')) { callback({ path: p }); return }
    }
    // 封面图: kiroq://cover/{absolutePath}
    if (url.startsWith('cover/')) {
      const filePath = url.slice('cover/'.length)
      if (filePath && /^[A-Za-z]:[\\\/]/.test(filePath)) {
        callback({ path: filePath }); return
      }
    }
    callback({ error: -2 })
  })

  createWindow()
  registerLibraryIpc(mainWindow!)
  registerSettingsIpc(mainWindow!)
  registerPlayerIpc(mainWindow!)
  registerBangumiIpc()
  registerImageLibraryIpc(mainWindow!)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { flush(); flushImageStore(); app.quit() }
})
app.on('before-quit', () => { flush(); flushImageStore() })
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
} // 关闭 gotTheLock else 块
