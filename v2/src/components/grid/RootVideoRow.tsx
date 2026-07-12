/**
 * 根目录视频行（列表模式）。
 */
import { useEffect, useState } from 'react'

interface RootVideoRowProps {
  fileName: string
  filePath: string
  isWatched: boolean
  durationSec?: number
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  even?: boolean
}

function formatDuration(sec?: number): string | null {
  if (!sec || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RootVideoRow({
  fileName, filePath, isWatched, durationSec, onOpen, onContextMenu, even,
}: RootVideoRowProps) {
  const dur = formatDuration(durationSec)
  const [thumbHash, setThumbHash] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.getThumbnail(filePath, 72, 72).then(hash => { if (!cancelled) setThumbHash(hash) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer select-none"
      style={{ backgroundColor: even ? 'var(--kq-row-even)' : 'var(--kq-row-odd)' }}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--kq-row-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = even ? 'var(--kq-row-even)' : 'var(--kq-row-odd)')}
    >
      <span className="shrink-0" style={{ color: isWatched ? '#88cc88' : 'var(--kq-unwatched-text)' }}>●</span>
      <div className="w-9 h-9 rounded overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'var(--kq-bg-nav)' }}>
        {thumbHash
          ? <img src={`kiroq://thumbnail/${thumbHash}`} className="w-full h-full object-cover" />
          : <span className="text-sm">🎞️</span>}
      </div>
      <span className="flex-1 text-xs truncate" style={{ color: isWatched ? 'var(--kq-watched-text)' : 'var(--kq-text-primary)' }}>
        {fileName}
      </span>
      {dur && <span className="text-[10px] shrink-0" style={{ color: 'var(--kq-text-dim)' }}>{dur}</span>}
    </div>
  )
}
