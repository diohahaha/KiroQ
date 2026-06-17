/**
 * PotPlayer 窗口标题监控服务（PowerShell 实现，零原生依赖）。
 * 已核对旧版 utils.py _watch_player_thread()：
 *   - 用途：播放器运行期间轮询窗口标题，关闭后批量标记已看
 *   - 轮询间隔：2 秒
 *   - 启动延迟：1.5 秒
 *
 * 用 PowerShell 枚举窗口替代 node-window-manager（避免 native 编译问题）。
 */
import { BrowserWindow } from 'electron'
import { exec } from 'child_process'

let watcherInterval: ReturnType<typeof setInterval> | null = null

export interface WatchContext {
  procPid: number
  videos: string[]
  folderPath: string
}

function getPotPlayerWindowTitle(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty MainWindowTitle`
    exec(
      `powershell -NoProfile -Command "${cmd}"`,
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) { resolve(null); return }
        const title = stdout.trim()
        resolve(title || null)
      },
    )
  })
}

export function startWatching(
  ctx: WatchContext,
  mainWindow: BrowserWindow,
  onFinished: (playedFiles: string[]) => void,
): void {
  stopWatching()

  setTimeout(() => {
    const played = new Set<string>()

    watcherInterval = setInterval(async () => {
      try {
        const alive = isProcessAlive(ctx.procPid)
        if (!alive) {
          stopWatching()
          onFinished(Array.from(played))
          return
        }

        const title = await getPotPlayerWindowTitle(ctx.procPid)
        if (!title) return

        // 匹配文件名（已核对旧版逻辑）
        for (const v of ctx.videos) {
          if (played.has(v)) continue
          const nameNoExt = v.replace(/\.[^.]+$/, '')
          if (title.includes(v) || title.startsWith(nameNoExt)) {
            played.add(v)
            mainWindow.webContents.send('player:titleChanged', title)
          }
        }
      } catch (e) {
        console.debug('[potplayerWatcher] error:', e)
      }
    }, 2000) // 已核对旧版：轮询间隔 2 秒
  }, 1500) // 已核对旧版：1.5 秒启动延迟
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function stopWatching(): void {
  if (watcherInterval) {
    clearInterval(watcherInterval)
    watcherInterval = null
  }
}
