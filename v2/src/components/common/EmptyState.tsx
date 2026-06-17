/**
 * 空状态占位组件
 */
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon = '📂', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <span className="text-5xl mb-4">{icon}</span>
      <p className="text-lg font-semibold mb-2" style={{ color: 'var(--kq-text-primary)' }}>
        {title}
      </p>
      {description && (
        <p className="text-sm mb-6 text-center max-w-md" style={{ color: 'var(--kq-text-muted)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
