/**
 * 简介文本框（纯文本渲染）。
 * 已核对旧版：CTkTextbox 是纯文本，非富文本/Markdown
 */
interface DescriptionBoxProps {
  description: string
}

export function DescriptionBox({ description }: DescriptionBoxProps) {
  if (!description) {
    return (
      <p className="text-sm italic" style={{ color: 'var(--kq-text-dim)' }}>
        暂无简介
      </p>
    )
  }

  return (
    <div
      className="p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto"
      style={{
        backgroundColor: 'var(--kq-desc-bg)',
        color: 'var(--kq-text-primary)',
      }}
    >
      {description}
    </div>
  )
}
