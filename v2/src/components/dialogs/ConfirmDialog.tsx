/**
 * 通用确认对话框。
 * 已核对旧版 confirm_dialog()：标题 + 消息 + 确定（红色）+ 取消
 */
import { Modal } from '@/components/common/Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} className="w-[360px]">
      <div className="p-6 space-y-4">
        <h3 className="text-base font-semibold" style={{ color: 'var(--kq-text-primary)' }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--kq-text-muted)' }}>
          {message}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--kq-border)', color: 'var(--kq-text-primary)' }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-md text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#aa3a3a' }}
          >
            确定
          </button>
        </div>
      </div>
    </Modal>
  )
}
