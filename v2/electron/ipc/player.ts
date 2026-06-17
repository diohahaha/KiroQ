/**
 * Player IPC handlers
 */
import { app } from 'electron'
import { ipcMain, BrowserWindow } from 'electron'
import { spawn, exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { IPC } from '../../shared/types'
import { startWatching } from '../services/potplayerWatcher'
import { markWatched } from '../services/store'
import { scanFolder } from '../services/scanner'

function getPlayerPath(): string {
  const fp = path.join(app.getPath('userData'), 'kiroq-settings.json')
  try {
    if (fs.existsSync(fp)) {
      const s = JSON.parse(fs.readFileSync(fp, 'utf-8'))
      return s.playerPath || ''
    }
  } catch { /* ignore */ }
  return ''
}

export function registerPlayerIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.PLAYER_LAUNCH, async (_e, videoFilePath: string, folderPath: string) => {
    const playerPath = getPlayerPath()

    let proc: ReturnType<typeof spawn> | null = null

    if (playerPath) {
      proc = spawn(playerPath, [videoFilePath], {
        detached: true, stdio: 'ignore', windowsHide: true,
      })
    } else {
      exec(`start "" "${videoFilePath}"`, { windowsHide: true })
    }

    if (proc && proc.pid) {
      const { videos } = scanFolder(folderPath)
      markWatched(videoFilePath, folderPath)

      startWatching(
        { procPid: proc.pid, videos, folderPath },
        mainWindow,
        (playedFiles) => {
          for (const fileName of playedFiles) {
            const fp = path.join(folderPath, fileName)
            markWatched(fp, folderPath)
          }
          mainWindow.webContents.send('player:closed')
        },
      )
      proc.unref()
    } else if (!playerPath) {
      // 系统默认打开方式，标记已看
      markWatched(videoFilePath, folderPath)
    }

    return true
  })
}
