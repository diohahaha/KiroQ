/**
 * 详情页转场动画：滑入/滑出 + 淡入淡出
 *
 * 首页（视频库/图片库）不再走这里——首页现在常驻挂载在 App.tsx 里，只靠 CSS
 * display 切显隐，不需要转场动画，也不能放进这个 AnimatePresence 里，
 * 不然每次 key 变化（进/退详情页）都会把首页一起卸载重挂载，重新触发
 * VirtualGrid 的 ResizeObserver 测量，又闪一下。这里只包详情页这一层。
 */
import { motion, AnimatePresence } from 'framer-motion'
import type { PageState } from '@/state/navigationStore'

interface PageTransitionProps {
  /** 是否挂载详情页这一层——用这个来控制进/退场，而不是靠外层条件渲染直接
   * 卸载整个 PageTransition（那样 AnimatePresence 自己也没了，退场动画根本
   * 没机会播放）。 */
  show: boolean
  page: PageState
  children: React.ReactNode
}

export function PageTransition({ show, page, children }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key={page.type}
          className="absolute inset-0 flex flex-col overflow-hidden z-10"
          style={{ backgroundColor: 'var(--kq-bg-detail)' }}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
