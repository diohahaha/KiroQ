/**
 * PotPlayer 窗口标题监控 — 枚举所有 PotPlayer 进程窗口
 * 已核对旧版 utils.py _watch_player_thread() + EnumWindows
 */
import { BrowserWindow } from 'electron'
import { exec } from 'child_process'

let watcherInterval: ReturnType<typeof setInterval> | null = null

export interface WatchContext {
  procPid: number
  videos: string[]
  folderPath: string
}

/** PowerShell：获取所有 PotPlayer* 进程的可见窗口标题 */
function getPotPlayerTitles(): Promise<string[]> {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "Get-Process -Name 'PotPlayer*','PotPlayerMini*' -ErrorAction SilentlyContinue | ForEach-Object { \$_.MainWindowTitle } | Where-Object { \$_ }"`,
      { timeout: 5000, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err) { resolve([]); return }
        resolve(stdout.split('\n').map(s => s.trim()).filter(Boolean))
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
        // 检查是否有 PotPlayer 进程在运行
        const titles = await getPotPlayerTitles()
        if (titles.length === 0) {
          // PotPlayer 关了 → 标记已看并停止
          if (played.size > 0) {
            onFinished(Array.from(played))
          }
          stopWatching()
          return
        }

        for (const title of titles) {
          for (const v of ctx.videos) {
            if (played.has(v)) continue
            const noExt = v.replace(/\.[^.]+$/, '')
            if (title.includes(v) || title.startsWith(noExt)) {
              played.add(v)
              mainWindow.webContents.send('player:titleChanged', title)
            }
          }
        }
      } catch (e) {
        console.debug('[potplayerWatcher] error:', e)
      }
    }, 2000)
  }, 1500)
}

export function stopWatching(): void {
  if (watcherInterval) { clearInterval(watcherInterval); watcherInterval = null }
}
