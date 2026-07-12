/**
 * 滚动位置记忆——不用 React state（组件卸载就没了），用一个模块级的 Map 存，
 * 只要这次软件运行没关，退出文件夹再进回来（甚至跳好几层再回来）都能恢复。
 * key 用路径就行：图片库首页固定一个 key，详情页用 folderPath 本身（每个
 * 文件夹分开记，不会互相覆盖）。
 */
const positions = new Map<string, number>()

export function saveScrollPosition(key: string, top: number): void {
  positions.set(key, top)
}

export function getScrollPosition(key: string): number {
  return positions.get(key) || 0
}
