/**
 * PDF 封面生成：调用 pdftoppm 把第一页渲染成图片。
 * 和视频缩略图（execFile 调 ffmpeg）走的是同一个思路——独立进程，不占用
 * Node 主线程，不会像 adm-zip 那样阻塞事件循环。
 *
 * 坑：pdftoppm 输出文件名会按整份 PDF 的总页数来决定序号补零位数
 * （比如整份 PDF 有 200 页，哪怕只渲染第 1 页，输出文件也可能叫
 * "prefix-001.jpg" 而不是 "prefix-1.jpg"），没法直接拼出确定的文件名。
 * 所以每次渲染都用一个独立的临时目录 + 固定前缀，渲染完直接扫这个目录，
 * 唯一的那个文件就是结果，再搬到最终缓存路径，不用猜文件名。
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { findPdftoppm } from './pdfLocator'
import { logCoverError } from './coverErrorLog'
import { MAX_ARCHIVE_SIZE, ABSOLUTE_MAX_SIZE } from './imageCover'

function tooLargeToProcess(filePath: string, force: boolean): boolean {
  try {
    const size = fs.statSync(filePath).size
    if (size > ABSOLUTE_MAX_SIZE) return true
    return !force && size > MAX_ARCHIVE_SIZE
  } catch {
    return false
  }
}

function tempRenderDir(): string {
  const dir = path.join(app.getPath('temp'), 'kiroq-pdf-render')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 渲染 PDF 第一页到 outputPath（jpg）。成功返回 true，失败返回 false
 * （找不到 pdftoppm、PDF 本身损坏/加密、渲染超时等都算失败，不抛异常）。
 */
export async function generatePdfCover(pdfPath: string, outputPath: string, force = false): Promise<boolean> {
  const exe = findPdftoppm()
  if (!exe) {
    logCoverError(pdfPath, 'pdftoppm 未找到，PDF 封面功能不可用（检查 bin/ 目录）')
    return false
  }

  if (tooLargeToProcess(pdfPath, force)) {
    const size = (() => { try { return fs.statSync(pdfPath).size } catch { return 0 } })()
    const limitMB = size > ABSOLUTE_MAX_SIZE ? ABSOLUTE_MAX_SIZE / 1024 / 1024 : MAX_ARCHIVE_SIZE / 1024 / 1024
    logCoverError(pdfPath, `文件超过 ${limitMB}MB 上限，跳过渲染${size > ABSOLUTE_MAX_SIZE ? '（绝对上限，强制模式也不处理）' : ''}`)
    return false
  }

  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const jobDir = path.join(tempRenderDir(), jobId)
  fs.mkdirSync(jobDir, { recursive: true })
  const prefix = path.join(jobDir, 'page')

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-jpeg',
        '-f', '1', '-l', '1',      // 只渲染第一页
        '-scale-to', '600',        // 和 imageCover.ts 的 THUMBNAIL_MAX_DIM 保持一致，
                                    // 兼顾缩放滑条能拖到的最大卡片尺寸 + 高分屏 2 倍像素密度
        pdfPath, prefix,
      ]
      execFile(exe, args, { timeout: 20000 }, (err) => {
        if (err) reject(err); else resolve()
      })
    })

    const produced = fs.readdirSync(jobDir).filter(f => f.startsWith('page'))
    if (produced.length === 0) {
      logCoverError(pdfPath, 'pdftoppm 执行完成但没有产出文件（可能是加密/损坏的 PDF）')
      return false
    }
    fs.copyFileSync(path.join(jobDir, produced[0]), outputPath)
    return true
  } catch (e) {
    logCoverError(pdfPath, `pdftoppm 渲染失败: ${(e as Error).message}`)
    return false
  } finally {
    // 临时目录用完即删，不留垃圾
    try { fs.rmSync(jobDir, { recursive: true, force: true }) } catch { /* 忽略 */ }
  }
}
