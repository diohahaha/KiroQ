/**
 * 视频缩略图组件。
 * src 使用 kiroq:// 自定义协议（强制，不允许 file://），详见文档 5.6
 *
 * 缩略图是后台 ffmpeg 异步截帧生成的，主进程 getThumbnail IPC 一开始就把 hash
 * 返回给前端了，这时候磁盘上的文件可能还没生成完，第一次请求会 404。
 * 这里加载失败后不再是直接放弃，而是隔一段时间自动重试几次（用 key 强制
 * <img> 重新挂载、重新发请求），等 ffmpeg 后台生成完就能自动刷出来，
 * 不用再重新进入页面。
 */
import { useState, useEffect, useRef } from 'react'
import { Film } from 'lucide-react'

interface ThumbnailProps {
  videoId: string
  alt: string
  width?: number
  height?: number
  className?: string
}

const MAX_RETRIES = 6
const RETRY_DELAY_MS = 800

export function Thumbnail({ videoId, alt, width = 360, height = 240, className = '' }: ThumbnailProps) {
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // videoId 变了（换成别的视频）→ 重置错误/重试状态，不带着上一个视频的失败记录
  useEffect(() => {
    setError(false)
    setAttempt(0)
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current) }
  }, [videoId])

  const handleError = () => {
    setAttempt(prev => {
      if (prev >= MAX_RETRIES) {
        setError(true)
        return prev
      }
      retryTimer.current = setTimeout(() => setAttempt(a => a + 1), RETRY_DELAY_MS)
      return prev
    })
  }

  if (error || !videoId) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--kq-bg-nav)] ${className}`}
        style={{ width, height }}
      >
        <Film size={32} color="var(--kq-text-dim)" />
      </div>
    )
  }

  return (
    <img
      // key 随 attempt 变化 → 强制重新挂载 <img>，重新发起请求，绕开上一次的失败结果
      key={attempt}
      src={`kiroq://thumbnail/${videoId}`}
      alt={alt}
      width={width}
      height={height}
      className={`object-cover bg-[var(--kq-bg-nav)] ${className}`}
      onError={handleError}
      loading="lazy"
    />
  )
}
