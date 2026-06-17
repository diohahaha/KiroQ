/**
 * 通用 Modal — flexbox 居中，ESC 关闭
 */
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  open: boolean; onClose: () => void; children: React.ReactNode
  className?: string; closeOnOverlay?: boolean
}

export function Modal({ open, onClose, children, className = '', closeOnOverlay = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          className="fixed inset-0 bg-black/60"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={closeOnOverlay ? onClose : undefined}
        />
        <motion.div
          className={`relative z-10 rounded-lg shadow-2xl border overflow-hidden max-h-[90vh] ${className}`}
          style={{ backgroundColor: 'var(--kq-bg-card)', borderColor: 'var(--kq-border)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}>
          {children}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
