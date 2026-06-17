/**
 * 格式化工具函数。
 * 已核对旧版 utils.py fmt_time() / _fmt_duration()
 */

/** 秒数 → "X 小时 Y 分钟" */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '不到 1 分钟'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) {
    return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
  }
  return `${m} 分钟`
}

/** 时间戳 → 可读时间 */
export function formatTime(ts: number | null): string {
  if (!ts) return ''
  const dt = new Date(ts)
  const now = new Date()
  if (dt.toDateString() === now.toDateString()) {
    return `今天 ${dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dt.toDateString() === yesterday.toDateString()) {
    return `昨天 ${dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  const diffDays = Math.floor((now.getTime() - dt.getTime()) / 86400000)
  if (diffDays < 7) {
    return dt.toLocaleDateString('zh-CN', { weekday: 'short' }) + ' ' +
      dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return dt.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 字节 → 可读文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i]
}

/** 文件名去扩展名 */
export function stripExt(filename: string): string {
  const dotIdx = filename.lastIndexOf('.')
  return dotIdx > 0 ? filename.slice(0, dotIdx) : filename
}
