/**
 * 根目录视频卡片（宫格模式）——外观和 AnimeCard 保持一致（同样的圆角/边框/
 * 居中标题），只是封面换成横版 16:9（贴合视频本身画面）、内容是单个视频
 * 文件：ffmpeg 截帧缩略图、右下角时长角标、左上角已看勾选。
 */
import { useEffect, useState, useRef } from 'react'

interface RootVideoCardProps {
  fileName: string
  filePath: string
  isWatched: boolean
  durationSec?: number
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  size?: number
  selectMode?: boolean
  isSelected?: boolean
  onSelectToggle?: () => void
}

const MAX_THUMB_RETRIES = 6
const THUMB_RETRY_DELAY_MS = 800

// 虚拟滚动会让卡片频繁挂载卸载，每次挂载都重新走 IPC 取 hash 会导致
// 短暂显示占位符（🎬）再替换成图片——肉眼看到就是"闪"。
// 用模块级缓存把 hash 记下来，重新挂载时直接渲染，不用等 IPC。
const thumbCache = new Map<string, string | null>()

/** 视频卡片的实际高度（横版封面 + 两行标题空间），给 AnimeGrid 算视频行行高用，
 * 保持唯一数据来源，不用在两个文件里各写一份数字容易对不上。 */
export function getRootVideoCardHeight(size: number): number {
  const coverW = size - 6
  const coverH = Math.round(coverW * (9 / 16))
  return coverH + 78
}

export function RootVideoCard({
  fileName, filePath, isWatched, durationSec, onOpen, onContextMenu, size = 160,
  selectMode, isSelected, onSelectToggle,
}: RootVideoCardProps) {
  // 封面用横版 16:9——视频本身就是横的，套用番剧海报的竖版比例会显得很怪。
  // 卡片外框（圆角/边框/标题居中）仍然和 AnimeCard 一致，只是封面区域矮一些，
  // 矮出来的部分是宫格统一行高留下的空白，不影响观感（原设计就是这样）。
  const coverW = size - 6
  const coverH = Math.round(coverW * (9 / 16))
  const cardMinHeight = getRootVideoCardHeight(size)
  const dur = formatDuration(durationSec)
  const cached = thumbCache.get(filePath)
  const [thumbHash, setThumbHash] = useState<string | null>(cached ?? null)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 缓存命中：直接渲染，不闪
    if (cached !== undefined) {
      setThumbHash(cached)
      return
    }
    let cancelled = false
    setThumbFailed(false)
    setAttempt(0)
    window.api.getThumbnail(filePath, Math.round(coverW * 2), Math.round(coverH * 2)).then(hash => {
      thumbCache.set(filePath, hash ?? null)
      if (!cancelled) setThumbHash(hash)
    })
    return () => {
      cancelled = true
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  // 缩略图是后台异步生成的，第一次请求时文件可能还没生成完（404）。
  // 失败后隔一小段时间自动重试几次（用 key 强制 <img> 重新挂载重新请求），
  // 生成完就能自动刷出来，不用再重新进入文件夹。
  const handleThumbError = () => {
    setAttempt(prev => {
      if (prev >= MAX_THUMB_RETRIES) {
        setThumbFailed(true)
        return prev
      }
      retryTimer.current = setTimeout(() => setAttempt(a => a + 1), THUMB_RETRY_DELAY_MS)
      return prev
    })
  }

  return (
    <div
      className="relative rounded-lg border cursor-pointer transition-colors duration-150 flex flex-col select-none"
      style={{
        backgroundColor: 'var(--kq-bg-card)',
        borderColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-border)',
        borderWidth: isSelected ? 2 : 1,
        width: size, minHeight: cardMinHeight,
      }}
      onClick={() => { if (selectMode && onSelectToggle) onSelectToggle() }}
      onDoubleClick={() => { if (!selectMode) onOpen() }}
      onContextMenu={onContextMenu}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--kq-border-hover)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--kq-border)' }}
    >
      {/* 选择框（多选模式） */}
      {selectMode && (
        <div
          className="absolute top-1 left-1 w-[22px] h-[22px] rounded flex items-center justify-center text-xs font-bold z-10"
          style={{
            backgroundColor: isSelected ? 'var(--kq-accent)' : 'var(--kq-cb-unchecked)',
            color: isSelected ? '#fff' : 'transparent',
          }}
        >
          {isSelected ? '✓' : ''}
        </div>
      )}
      {/* 封面 */}
      <div className="relative mx-[3px] mt-[6px] rounded-lg overflow-hidden" style={{ width: coverW, height: coverH, backgroundColor: 'var(--kq-bg-nav)' }}>
        {thumbHash && !thumbFailed ? (
          <img key={attempt} src={`kiroq://thumbnail/${thumbHash}`} alt={fileName}
            className="w-full h-full object-cover"
            onError={handleThumbError} />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ fontSize: Math.max(coverH * 0.4, 18) }}>🎬</div>
        )}
        {/* 时长角标 —— 右下角，位置和 AnimeCard 的评分角标一致 */}
        {dur && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] rounded font-medium"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#eee' }}>{dur}</span>
        )}
        {/* 已看勾选 —— 左上角 */}
        {isWatched && (
          <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] rounded font-medium"
            style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: '#88cc88' }}>✓</span>
        )}
      </div>

      {/* 标题 —— 居中，最多两行，完整显示文件名（不像之前单行截断只看到开头）。
          居中用外层 flex，截断用内层 line-clamp——两者都要设 display，写在同一个
          元素上会互相冲突导致 line-clamp 失效（之前就是这样，文件名无限往下排）。 */}
      <div className="px-[5px] pt-[4px] flex-1 flex items-center justify-center">
        <div className="text-xs text-center leading-tight line-clamp-2"
          style={{ color: isWatched ? 'var(--kq-watched-text)' : 'var(--kq-text-primary)' }}
          title={fileName}
        >
          {fileName}
        </div>
      </div>

      {/* 底部占位行 —— 对齐 AnimeCard 状态标签的高度，视频没有状态就留空 */}
      <div className="flex items-center px-[6px] pb-[4px]">
        <span />
      </div>
    </div>
  )
}

function formatDuration(sec?: number): string | null {
  if (!sec || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
