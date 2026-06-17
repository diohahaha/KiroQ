/**
 * 视频缩略图生成服务（ffmpeg 截帧 + 磁盘缓存）。
 * 已核对旧版 utils.py _extract_thumb_ffmpeg()：
 *   ffmpeg -y -ss 5 -i videoPath -vframes 1 -vf scale=w:h:force_original_aspect_ratio=increase,crop=w:h -q:v 3 outputPath
 *   seekTime 固定 5 秒（旧版也是 5 秒）
 *   磁盘缓存到 userData/thumbnails/{videoId}.jpg
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { findFfmpeg } from './ffmpegLocator'

function thumbDir(): string {
  const dir = path.join(app.getPath('userData'), 'thumbnails')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function thumbnailPath(videoId: string): string {
  return path.join(thumbDir(), `${videoId}.jpg`)
}

export function thumbnailExists(videoId: string): boolean {
  return fs.existsSync(thumbnailPath(videoId))
}

export async function generateThumbnail(
  videoPath: string,
  videoId: string,
  width: number,
  height: number,
): Promise<string | null> {
  const exe = findFfmpeg()
  if (!exe) return null

  const output = thumbnailPath(videoId)

  // 磁盘缓存命中 → 直接返回
  if (fs.existsSync(output) && fs.statSync(output).size > 0) {
    return output
  }

  return new Promise((resolve) => {
    const args = [
      '-y',
      '-ss', '5', // 已核对旧版：固定第 5 秒截帧
      '-i', videoPath,
      '-vframes', '1',
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
      '-q:v', '3',
      output,
    ]
    execFile(exe, args, { timeout: 20000 }, (err) => {
      if (err) {
        console.debug(`[thumbnail] failed for ${videoPath}:`, err.message)
        resolve(null)
        return
      }
      if (fs.existsSync(output) && fs.statSync(output).size > 0) {
        resolve(output)
      } else {
        resolve(null)
      }
    })
  })
}
