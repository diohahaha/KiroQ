/**
 * 颜色混合工具。
 * 已核对旧版 config.py _blend(): 线性 RGB 插值
 *   r = r1 + (r2 - r1) * ratio
 * 在 CSS 中用 color-mix() 替代，此处保留 JS 版本以备动态计算需要。
 */

export function blendHex(hex1: string, hex2: string, ratio: number = 0.5): string {
  const r1 = parseInt(hex1.slice(1, 3), 16)
  const g1 = parseInt(hex1.slice(3, 5), 16)
  const b1 = parseInt(hex1.slice(5, 7), 16)
  const r2 = parseInt(hex2.slice(1, 3), 16)
  const g2 = parseInt(hex2.slice(3, 5), 16)
  const b2 = parseInt(hex2.slice(5, 7), 16)

  const r = Math.round(r1 + (r2 - r1) * ratio)
  const g = Math.round(g1 + (g2 - g1) * ratio)
  const b = Math.round(b1 + (b2 - b1) * ratio)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
