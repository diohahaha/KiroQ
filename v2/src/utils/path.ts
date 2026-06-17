/** 统一路径格式 — 复制旧版 np() = os.path.normpath */
export function np(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\\\+/g, '\\')
}

/** 拼接路径 */
export function joinPath(base: string, name: string): string {
  return np(base + '\\' + name)
}

/** 获取文件夹名 */
export function basename(p: string): string {
  const parts = np(p).split('\\')
  return parts[parts.length - 1] || p
}
