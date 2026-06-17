/**
 * 番剧宫格 — 动态间距 + 补位动画
 *
 * 设计：卡片宽度固定 160px 不变。容器宽度变化时，先算出当前宽度下
 * 用最小间距(GAP_MIN)最多能塞几张卡（列数 c），再反算这一行该用多大
 * 的 gap 才能让 c 张卡正好撑满整行宽度，最后 clamp 到 [GAP_MIN, GAP_MAX]。
 * 这样保证：① 间距永远不会小于 GAP_MIN（不会贴在一起）
 *          ② 间距被压到 GAP_MIN 附近、容器够宽时才会多塞一张卡（补位）
 *          ③ clamp 到 GAP_MAX 后会重新校验是否能再塞一张卡，避免错位
 */
import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AnimeCard } from './AnimeCard'
import type { AppData } from '@shared/types'
import { joinPath } from '@/utils/path'
import { cleanDisplayName } from '@/utils/cleanName'

const CARD_W = 160
const GAP_MIN = 10
const GAP_MAX = 32
const GAP_FALLBACK = 16 // 首帧渲染、ResizeObserver 还没跑之前的兜底值，避免贴边闪烁

function calcGap(w: number): number {
  const usable = Math.max(w, CARD_W)

  // 极端情况：容器连"1 张卡 + 两侧最小间距"都塞不下，gap 退化为能塞下的最大值
  // （理论下限，实际窗口宽度几乎不会触发，但保留以避免数学上的溢出）
  if (usable < CARD_W + 2 * GAP_MIN) {
    return Math.max(Math.floor((usable - CARD_W) / 2), 0)
  }

  // 1. 用最小间距，算出最多能塞下几张卡（保证至少有 GAP_MIN 的间距）
  let c = Math.floor((usable - GAP_MIN) / (CARD_W + GAP_MIN))
  c = Math.max(c, 1)

  // 2. 反算：c 张卡 + (c+1) 个缝，正好撑满 usable 宽度时，每个缝该多大
  let gap = Math.floor((usable - c * CARD_W) / (c + 1))
  gap = Math.min(Math.max(gap, GAP_MIN), GAP_MAX)

  // 3. 校验：clamp 到 GAP_MAX 后是否腾出了足够空间，能再多塞一张卡
  //    （否则会出现"卡数和 gap 不匹配，flex-wrap 实际换行结果跟预期不一致"的错位）
  while ((c + 1) * CARD_W + (c + 2) * GAP_MIN <= usable) {
    c++
    gap = Math.floor((usable - c * CARD_W) / (c + 1))
    gap = Math.min(Math.max(gap, GAP_MIN), GAP_MAX)
  }

  return gap
}

interface AnimeGridProps {
  rootPath: string; dirNames: string[]; data: AppData
  videoCounts?: Record<string, number>; cleanDisplay: boolean
  onEnter: (folderPath: string, name: string) => void
  onContextMenu: (e: React.MouseEvent, folderPath: string, displayName: string) => void
  selectMode?: boolean; selectedPaths?: Set<string>; onSelectToggle?: (folderPath: string) => void
}

export function AnimeGrid(p: AnimeGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [gap, setGap] = useState(GAP_FALLBACK)
  const mountedRef = useRef(false)

  const hasData = p.dirNames.length > 0

  // 标记已完成首次渲染（ref 变化不触发重渲染，layout 动画在下一帧自然生效）
  useEffect(() => { mountedRef.current = true }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = () => {
      const w = el.clientWidth
      if (w > 50) setGap(calcGap(w))
    }
    apply()

    const obs = new ResizeObserver(apply)
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasData]) // 依赖 hasData：组件从"空状态"切换到"有数据状态"时会重新渲染出
                // 带 ref 的真实 DOM 节点，这里重新执行一次 effect 才能正确拿到它
                // （首次挂载若恰好是空状态，那次 ref.current 必然是 null，且依赖
                // 数组为空的话不会再有第二次机会）

  if (!hasData) {
    return <div className="flex justify-center py-10 text-sm" style={{ color: 'var(--kq-empty-text)' }}>这里还没有番剧</div>
  }

  return (
    <div
      ref={ref}
      className="w-full flex flex-wrap"
      style={{ gap, padding: `8px ${gap}px`, transition: 'gap 0.2s ease-out', willChange: 'gap' } as React.CSSProperties}
    >
      {/* key={p.rootPath}：切换到不同文件夹时 rootPath 变化，React 把整个
          AnimatePresence 当作全新挂载，直接显示新内容，不会把"换了一批
          完全不同的卡片"误判成"这批卡片全部入场"而播放飞入动画。
          同一文件夹内部增删/置顶卡片时 rootPath 不变，key 不变，
          补位动画照常生效。 */}
      <AnimatePresence mode="popLayout" key={p.rootPath}>
        {p.dirNames.map(d => {
          const fp = joinPath(p.rootPath, d)
          const meta = p.data.folderMeta[fp] || null
          const wl = p.data.watched[fp] || []
          const total = p.videoCounts?.[fp] ?? 0
          return (
            <AnimeCard
              key={d} folderPath={fp}
              displayName={meta?.name || (p.cleanDisplay ? cleanDisplayName(d) : d)}
              meta={meta}
              isPinned={p.data.pinned.includes(fp)}
              isHidden={p.data.hidden.includes(fp)}
              watchedCount={wl.length} totalVideos={total}
              onEnter={() => p.onEnter(fp, meta?.name || d)}
              onContextMenu={e => p.onContextMenu(e, fp, meta?.name || d)}
              selectMode={p.selectMode} isSelected={p.selectedPaths?.has(fp)}
              onSelectToggle={p.onSelectToggle ? () => p.onSelectToggle(fp) : undefined}
              enableAnimation={!p.selectMode && mountedRef.current}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
