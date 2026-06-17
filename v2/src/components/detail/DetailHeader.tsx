/**
 * 详情页头部：标题 + 标签 + 播放/编辑按钮
 */
import { Play, Edit3, Star, ArrowLeft } from 'lucide-react'
import type { VideoEntry } from '@shared/types'
import { formatTime, formatFileSize } from '@/utils/format'

interface DetailHeaderProps {
  video: VideoEntry
  onPlay: () => void
  onEdit: () => void
  onBack: () => void
  onToggleFavorite: () => void
}

export function DetailHeader({ video, onPlay, onEdit, onBack, onToggleFavorite }: DetailHeaderProps) {
  return (
    <div className="space-y-3">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm hover:opacity-70 transition-opacity"
        style={{ color: 'var(--kq-text-dim)' }}
      >
        <ArrowLeft size={14} />
        返回库
      </button>

      {/* 标题行 */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--kq-text-primary)' }}>
          {video.title}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleFavorite}
            className="p-2 rounded-md border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--kq-border)' }}
            title={video.favorite ? '取消收藏' : '收藏'}
          >
            <Star
              size={18}
              fill={video.favorite ? '#ffaa00' : 'none'}
              color={video.favorite ? '#ffaa00' : 'var(--kq-text-dim)'}
            />
          </button>
          <button
            onClick={onPlay}
            className="flex items-center gap-2 px-5 py-2 rounded-md text-white font-medium transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--kq-accent)' }}
          >
            <Play size={16} fill="white" />
            播放
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-md border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--kq-border)' }}
            title="编辑信息"
          >
            <Edit3 size={16} color="var(--kq-text-primary)" />
          </button>
        </div>
      </div>

      {/* 元信息 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--kq-text-dim)' }}>
        {video.durationSec != null && (
          <span>时长: {Math.floor(video.durationSec / 60)} 分钟</span>
        )}
        {video.width && video.height && (
          <span>分辨率: {video.width}×{video.height}</span>
        )}
        <span>大小: {formatFileSize(video.fileSizeBytes)}</span>
        <span>观看: {video.watchCount} 次</span>
        {video.lastWatchedAt && (
          <span>最后观看: {formatTime(video.lastWatchedAt)}</span>
        )}
        {video.addedAt > 0 && (
          <span>添加于: {formatTime(video.addedAt)}</span>
        )}
      </div>

      {/* 标签 */}
      {video.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {video.tags.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{
                backgroundColor: 'var(--kq-btn)',
                color: 'var(--kq-accent)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
