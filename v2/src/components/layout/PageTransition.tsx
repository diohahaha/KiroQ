/**
 * 页面转场动画：库页 ↔ 详情页
 * Framer Motion AnimatePresence + 滑动/淡入淡出
 */
import { motion, AnimatePresence } from 'framer-motion'
import type { PageState } from '@/state/navigationStore'

interface PageTransitionProps {
  page: PageState
  children: React.ReactNode
}

export function PageTransition({ page, children }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={page.type}
        className="flex-1 flex flex-col overflow-hidden"
        initial={{ opacity: 0, x: page.type === 'detail' ? 40 : -40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: page.type === 'detail' ? -40 : 40 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
