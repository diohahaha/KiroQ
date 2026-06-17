/**
 * ffmpeg/ffprobe 可执行文件定位。
 * 已核对旧版 utils.py _find_ffmpeg() / _find_ffprobe()：
 *   优先 bin/ 目录（EXE 同目录或源码目录），其次系统 PATH，最后 C:\ffmpeg\bin\
 *   打包时通过 electron-builder extraResources 内置
 */
import { app } from 'electron'
import * as path from 'path'
import { execFileSync } from 'child_process'

let ffmpegCache: string | null | undefined = undefined
let ffprobeCache: string | null | undefined = undefined

function probeExe(name: string): string | null {
  const isWin = process.platform === 'win32'
  const exeName = isWin ? `${name}.exe` : name

  // 候选路径（已核对旧版 _FFMPEG_PATHS / _FFPROBE_PATHS）
  const candidates: string[] = []

  // ① extraResources 内置（打包后）或 bin/ 目录（开发时）
  if (app.isPackaged) {
    const resourcesDir = path.join(process.resourcesPath, 'ffmpeg')
    candidates.push(path.join(resourcesDir, exeName))
  }
  // bin/ 在项目根目录（开发模式）
  candidates.push(path.join(process.cwd(), 'bin', exeName))
  // 源码目录 bin/
  candidates.push(path.join(__dirname, '..', '..', 'bin', exeName))
  // 系统 PATH
  candidates.push(exeName)
  // Windows 常见路径
  candidates.push(`C:\\ffmpeg\\bin\\${exeName}`)

  for (const p of candidates) {
    try {
      execFileSync(p, ['-version'], { timeout: 5000, stdio: 'ignore' })
      console.log(`[ffmpegLocator] ${name} found: ${p}`)
      return p
    } catch { /* continue */ }
  }

  return null
}

export function findFfmpeg(): string | null {
  if (ffmpegCache !== undefined) return ffmpegCache
  ffmpegCache = probeExe('ffmpeg')
  return ffmpegCache
}

export function findFfprobe(): string | null {
  if (ffprobeCache !== undefined) return ffprobeCache
  ffprobeCache = probeExe('ffprobe')
  return ffprobeCache
}

/** 重置缓存（用户更改自定义路径后调用） */
export function resetFfmpegCache(customFfmpegPath?: string): void {
  if (customFfmpegPath) {
    ffmpegCache = customFfmpegPath
    // 推断 ffprobe 路径
    const dir = path.dirname(customFfmpegPath)
    const isWin = process.platform === 'win32'
    const probeName = isWin ? 'ffprobe.exe' : 'ffprobe'
    ffprobeCache = path.join(dir, probeName)
    try {
      execFileSync(ffprobeCache, ['-version'], { timeout: 5000, stdio: 'ignore' })
    } catch {
      ffprobeCache = null
    }
  } else {
    ffmpegCache = undefined
    ffprobeCache = undefined
  }
}
