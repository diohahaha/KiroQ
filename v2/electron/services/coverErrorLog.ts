/**
 * 封面生成失败日志。
 * 打包后的软件里，主进程的 console.warn 不会出现在任何用户能看到的地方
 * （没有终端窗口，DevTools 只显示渲染进程的日志）。所以失败原因必须写进一个
 * 用户能自己打开看的文件里，不然只能靠猜。
 *
 * 日志文件位置：userData 目录下的 kiroq-image-cover-errors.log
 * （Windows 上通常是 %APPDATA%/KiroQ/kiroq-image-cover-errors.log）
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function logFilePath(): string {
  return path.join(app.getPath('userData'), 'kiroq-image-cover-errors.log')
}

/** 记录一条失败原因，同时也走 console.warn（开发模式下能在终端看到） */
export function logCoverError(filePath: string, reason: string): void {
  console.warn('[imageCover]', filePath, reason)
  try {
    const line = `[${new Date().toISOString()}] ${filePath} — ${reason}\n`
    fs.appendFileSync(logFilePath(), line, 'utf-8')
  } catch {
    // 日志本身写失败就算了，不能因为记日志又搞出问题
  }
}

/** 设置里加个"打开失败日志"按钮会用到 */
export function getLogFilePath(): string {
  return logFilePath()
}
