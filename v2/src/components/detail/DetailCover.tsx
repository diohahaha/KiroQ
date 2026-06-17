/**
 * 详情页封面/缩略图大图
 */
import { Thumbnail } from '@/components/common/Thumbnail'

interface DetailCoverProps {
  videoId: string
  title: string
}

export function DetailCover({ videoId, title }: DetailCoverProps) {
  return (
    <div className="w-full max-w-2xl rounded-lg overflow-hidden border" style={{ borderColor: 'var(--kq-border)' }}>
      <Thumbnail
        videoId={videoId}
        alt={title}
        className="w-full"
      />
    </div>
  )
}
