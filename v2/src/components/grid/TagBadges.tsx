/**
 * 标签角标 — 卡片右下角展示，位置对应视频卡片的 ⭐评分 角标。
 * 最多显示 2 个，超出显示 "+N"，hover 显示完整 tooltip。
 *
 * 之前的版本圆点只有 10px 又套了个半透明黑色描边，颜色本来就偏暗（跟主题匹配的
 * 低饱和色），描边一压根本分不清红黄蓝绿。这版改成：整组套一个统一的深色胶囊底，
 * 圆点本身加大 + 白色细边框，靠底色统一提供对比度，而不是每个点自己纠结怎么加边框。
 */
import type { ImageTagDef } from '@shared/types'

interface TagBadgesProps {
  tagIds: string[]
  allDefs: ImageTagDef[]
  maxVisible?: number
  /** true = 用于列表行等非绝对定位场景，false(默认) = 卡片右下角绝对定位角标 */
  inline?: boolean
}

export function TagBadges({ tagIds, allDefs, maxVisible = 2, inline = false }: TagBadgesProps) {
  if (!tagIds || tagIds.length === 0) return null
  const defs = tagIds.map(id => allDefs.find(d => d.id === id)).filter(Boolean) as ImageTagDef[]
  if (defs.length === 0) return null

  const visible = defs.slice(0, maxVisible)
  const overflow = defs.length - visible.length
  const fullLabel = defs.map(d => d.label).join('、')

  return (
    <div
      className={
        (inline ? 'flex items-center shrink-0 ' : 'absolute bottom-1 right-1 flex items-center z-10 ') +
        'gap-1 px-1.5 py-1 rounded-full'
      }
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      title={fullLabel}
    >
      {visible.map(tag => (
        tag.type === 'color' ? (
          <span
            key={tag.id}
            className="w-3.5 h-3.5 rounded-full"
            style={{ backgroundColor: tag.color, border: '1.5px solid rgba(255,255,255,0.85)' }}
          />
        ) : (
          <span
            key={tag.id}
            className="px-1.5 py-0.5 text-[9px] rounded font-medium leading-none"
            style={{ backgroundColor: tag.color, color: '#fff' }}
          >
            {tag.label}
          </span>
        )
      ))}
      {overflow > 0 && (
        <span className="text-[9px] font-medium leading-none" style={{ color: '#ddd' }}>
          +{overflow}
        </span>
      )}
    </div>
  )
}

/** 已看角标 — 卡片左上角，独立于标签系统 */
export function WatchedBadge({ watched }: { watched: boolean }) {
  if (!watched) return null
  return (
    <div
      className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] rounded font-medium z-10"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: '#88cc88' }}
    >
      ✓ 已看
    </div>
  )
}
