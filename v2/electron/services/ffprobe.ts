/**
 * ffprobe 视频信息探测服务。
 * 已核对旧版 utils.py get_video_duration()：
 *   ffprobe -v quiet -print_format json -show_format filePath
 *   提取 format.duration，超时 15s
 */
import { execFile } from 'child_process'
import { findFfprobe } from './ffmpegLocator'

export interface ProbeResult {
  durationSec: number | null
  width: number | null
  height: number | null
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const exe = findFfprobe()
  if (!exe) {
    return { durationSec: null, width: null, height: null }
  }

  return new Promise((resolve) => {
    execFile(
      exe,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.debug(`[ffprobe] probe failed for ${filePath}:`, err.message)
          resolve({ durationSec: null, width: null, height: null })
          return
        }
        try {
          const data = JSON.parse(stdout)
          const duration = data?.format?.duration ? parseFloat(data.format.duration) : null
          // 找第一个视频流
          let width: number | null = null
          let height: number | null = null
          if (data?.streams) {
            for (const stream of data.streams) {
              if (stream.codec_type === 'video') {
                width = stream.width ?? null
                height = stream.height ?? null
                break
              }
            }
          }
          resolve({ durationSec: duration, width, height })
        } catch {
          resolve({ durationSec: null, width: null, height: null })
        }
      },
    )
  })
}
