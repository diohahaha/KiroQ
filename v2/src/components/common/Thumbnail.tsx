/**
 * 视频缩略图组件。
 * src 使用 kiroq:// 自定义协议（强制，不允许 file://），详见文档 5.6
 */
import { useState } from 'react'
import { Film } from 'lucide-react'

interface ThumbnailProps {
  videoId: string
  alt: string
  width?: number
  height?: number
  className?: string
}

export function Thumbnail({ videoId, alt, width = 360, height = 240, className = '' }: ThumbnailProps) {
  const [error, setError] = useState(false)

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
      src={`kiroq://thumbnail/${videoId}`}
      alt={alt}
      width={width}
      height={height}
      className={`object-cover bg-[var(--kq-bg-nav)] ${className}`}
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}
