/**
 * 通用虚拟滚动列表——列表视图（单列）用这个，比宫格简单很多，
 * 不用算列数，直接用 react-window 的 FixedSizeList。
 */
import { useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react'
import { FixedSizeList as List } from 'react-window'
import { saveScrollPosition, getScrollPosition } from '@/utils/scrollMemory'

interface VirtualListProps<T> {
  items: T[]
  itemKey: (item: T) => string
  rowHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  gap?: number
  /** 传了这个就自动接入滚动位置记忆，不传就不记 */
  scrollKey?: string
}

export function VirtualList<T>({ items, itemKey, rowHeight, renderItem, gap = 2, scrollKey }: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const Row = useCallback(({ index, style }: any) => {
    const item = items[index]
    return (
      <div key={itemKey(item)} style={{ ...style, paddingBottom: gap }}>
        {renderItem(item, index)}
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, renderItem, itemKey, gap])

  const itemDataKey = useMemo(() => items.map(itemKey).join(','), [items, itemKey])

  const handleListScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    if (scrollKey) saveScrollPosition(scrollKey, scrollOffset)
  }, [scrollKey])
  const initialScrollOffset = scrollKey ? getScrollPosition(scrollKey) : 0

  // 宽或高只要有一个还是 0，都不能渲染 react-window 的 List——
  // 之前只检查了 width===0，漏了 height，是白屏复现的真正原因。
  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} className="absolute inset-0" />
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <List
        key={itemDataKey}
        itemCount={items.length}
        itemSize={rowHeight + gap}
        width={size.width}
        height={size.height}
        initialScrollOffset={initialScrollOffset}
        onScroll={handleListScroll}
      >
        {Row}
      </List>
    </div>
  )
}
