/**
 * 探测 pdftoppm 可执行文件路径（poppler 工具集的一部分，用来把 PDF 页面渲染成图片）。
 * 逻辑对齐 electron/services/ffmpegLocator.ts 找 ffmpeg 的方式：先找 bin/ 目录，
 * 再找系统 PATH。如果两边都找不到，PDF 封面直接跳过（前端 📖 图标兜底，不报错崩溃）。
 *
 * bin/ 目录下需要放 pdftoppm.exe 以及它依赖的几个 DLL（libpoppler、freetype、
 * zlib 等），完整一套从 poppler 的 Windows 发行版里拿，和你现在下载 ffmpeg 的
 * setup.bat 是同一个思路，建议一起改 setup.bat 顺便把这个也下载好，具体见
 * INTEGRATION_NOTES.md 里的说明。
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'

let cachedPath: string | null | undefined = undefined // undefined = 还没探测过

function candidateBinDir(): string {
  // 和 ffmpegLocator 一样：开发模式下是项目根目录的 bin/，打包后在 resources 旁边
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(process.cwd(), 'bin')
}

export function findPdftoppm(): string | null {
  if (cachedPath !== undefined) return cachedPath

  const exeName = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'
  const inBin = path.join(candidateBinDir(), exeName)
  if (fs.existsSync(inBin)) {
    cachedPath = inBin
    return cachedPath
  }

  // 系统 PATH 里有的话（比如 mac/linux 装了 poppler-utils），直接用命令名让 execFile 自己找
  cachedPath = exeName
  return cachedPath
}

/** 启动时探测一次，确认 pdftoppm 是否真的可用（bin/ 里放了文件不代表依赖的 DLL 都齐全） */
export function checkPdftoppmAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const exe = findPdftoppm()
    if (!exe) { resolve(false); return }
    execFile(exe, ['-v'], { timeout: 5000 }, (err) => resolve(!err))
  })
}
