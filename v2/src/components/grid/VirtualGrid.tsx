/**
 * 通用虚拟滚动宫格——视频库 AnimeGrid、图片库首页/详情页共用。
 * 支持 separatorIndex：在此索引之后插入一整行分隔符，用于隔开文件夹和视频。
 * 分隔符那一行用独立的矮行高（不跟卡片等高），避免中间空出一大块。
 */
import { useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react'
import { VariableSizeGrid as Grid } from 'react-window'
import { saveScrollPosition, getScrollPosition } from '@/utils/scrollMemory'

/** 分隔符占位标记（VirtualGrid 内部使用，调用方不需要关心） */
const SEP = Symbol('sep')
/** 分隔符独占的那一行高度，比卡片行矮很多，不再空出一整个卡片高度 */
const SEP_ROW_HEIGHT = 40

interface VirtualGridProps<T> {
  items: T[]
  itemKey: (item: T) => string
  cardWidth: number
  cardHeight: number
  minGap?: number
  renderItem: (item: T) => React.ReactNode
  padding?: number
  scrollKey?: string
  /** 在此索引之后插入一整行分隔符（索引基于原始 items），常用于隔开文件夹和视频 */
  separatorAfter?: number
  /** 分隔符之后的行改用这个高度（不传则和 cardHeight 一样）。用于文件夹卡片
   * （竖版、更高）和视频卡片（横版、更矮）混在同一个网格时，视频那几行
   * 不用被迫套用文件夹的高行高，卡片底下留一大片空白。 */
  secondaryCardHeight?: number
  /** 提供精确的外部高度 → block 模式（不用 absolute inset-0），用于包在滚动容器里 */
  height?: number
}

export function VirtualGrid<T>({
  items, itemKey, cardWidth, cardHeight, minGap = 12,
  renderItem, padding = 12, scrollKey, separatorAfter, secondaryCardHeight, height: externalHeight,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const blockMode = externalHeight != null

  useLayoutEffect(() => {
    if (blockMode) {
      // block 模式：宽高由外层传入，只需要宽度（用于算列数）
      const el = containerRef.current
      if (!el) return
      const update = () => setSize({ width: el.clientWidth, height: externalHeight })
      update()
      const obs = new ResizeObserver(update)
      obs.observe(el)
      return () => obs.disconnect()
    }
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [blockMode, externalHeight])

  const columnCount = Math.max(1, Math.floor((size.width - padding * 2 + minGap) / (cardWidth + minGap)))
  const usableWidth = Math.max(size.width - padding * 2, cardWidth)
  const columnWidth = columnCount > 0 ? usableWidth / columnCount : cardWidth
  const rowHeight = cardHeight + minGap
  const secondaryRowHeight = (secondaryCardHeight ?? cardHeight) + minGap

  // 如果有分隔符，在原始 items 中插入占位，让分隔符独占一整行；同时记录分隔符所在行号
  const { padded, sepRowIndex } = useMemo(() => {
    if (separatorAfter == null || separatorAfter <= 0 || separatorAfter >= items.length) {
      return { padded: items, sepRowIndex: null as number | null }
    }
    // 前半行末尾补空，后半行开头从新行开始
    const rem = separatorAfter % columnCount
    const padEnd = rem === 0 ? 0 : columnCount - rem
    const result: any[] = [
      ...items.slice(0, separatorAfter),
      ...Array(padEnd).fill(null),      // 填充文件夹最后一行剩余格子
      SEP,                                // 分隔符
      ...Array(columnCount - 1).fill(null), // 分隔符行其余格子为空
      ...items.slice(separatorAfter),
    ]
    return { padded: result, sepRowIndex: (separatorAfter + padEnd) / columnCount }
  }, [items, separatorAfter, columnCount])

  const rowCount = Math.ceil(padded.length / columnCount)

  const getRowHeight = useCallback((rowIndex: number) => {
    if (sepRowIndex != null && rowIndex === sepRowIndex) return SEP_ROW_HEIGHT
    if (sepRowIndex != null && rowIndex > sepRowIndex) return secondaryRowHeight
    return rowHeight
  }, [sepRowIndex, rowHeight, secondaryRowHeight])
  const getColumnWidth = useCallback(() => columnWidth, [columnWidth])

  const Cell = useCallback(({ columnIndex, rowIndex, style }: any) => {
    const index = rowIndex * columnCount + columnIndex
    if (index >= padded.length) return null
    const item = padded[index]
    if (item === null) return null
    if (item === SEP) {
      return (
        <div style={{ ...style, display: 'flex', alignItems: 'center' }}>
          <div className="w-full flex items-center px-2" style={{ color: 'var(--kq-text-dim)', fontSize: 11 }}>
            <span className="flex-1 border-t" style={{ borderColor: 'var(--kq-border)' }} />
            <span className="mx-3 font-medium">📺 根目录视频</span>
            <span className="flex-1 border-t" style={{ borderColor: 'var(--kq-border)' }} />
          </div>
        </div>
      )
    }
    return (
      <div key={itemKey(item)} style={{ ...style, display: 'flex', justifyContent: 'flex-start', paddingTop: minGap / 2 }}>
        {renderItem(item)}
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padded, columnCount, renderItem, itemKey, minGap])

  const itemDataKey = useMemo(() => {
    const base = items.map(itemKey).join(',')
    if (separatorAfter != null) return `${base}|sep${separatorAfter}|col${columnCount}|h${rowHeight}|sh${secondaryRowHeight}`
    return `${base}|col${columnCount}|h${rowHeight}`
  }, [items, itemKey, separatorAfter, columnCount, rowHeight, secondaryRowHeight])

  const handleGridScroll = useCallback(({ scrollTop }: { scrollTop: number }) => {
    if (scrollKey) saveScrollPosition(scrollKey, scrollTop)
  }, [scrollKey])
  const initialScrollTop = scrollKey ? getScrollPosition(scrollKey) : 0

  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} className={blockMode ? 'w-full' : 'absolute inset-0'} style={blockMode ? { height: externalHeight, overflow: 'hidden' } : undefined} />
  }

  return (
    <div ref={containerRef} className={blockMode ? 'w-full' : 'absolute inset-0'} style={blockMode ? { height: externalHeight, overflow: 'hidden' } : undefined}>
      <Grid
        key={itemDataKey}
        columnCount={columnCount}
        columnWidth={getColumnWidth}
        rowCount={rowCount}
        rowHeight={getRowHeight}
        width={size.width}
        height={size.height}
        initialScrollTop={initialScrollTop}
        onScroll={handleGridScroll}
        style={{ paddingLeft: padding, paddingRight: padding, paddingTop: padding, overflowX: 'hidden' as const, ...(blockMode ? { overflow: 'hidden' as const } : {}) }}
      >
        {Cell}
      </Grid>
    </div>
  )
}
