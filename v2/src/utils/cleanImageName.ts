/**
 * 图片库文件夹名清洗——不同于 src/utils/cleanName.ts（那套是动画压制组黑话词表，
 * 只适用于视频释出命名规则）。图片库（同人志/漫画/画集）命名习惯是：
 *   (会展代号) [社团名 (作者)] 标题 (原作/系列名) [语言] [汉化组]
 * 社团名、汉化组千变万化，没法靠固定词表识别，只能靠“位置”通用规则：
 *   - 开头连续的 (...)/[...] 块 → 去掉（会展代号、社团名）
 *   - 结尾连续的 [...] 方括号块 → 去掉（语言标签、汉化组名）
 *   - 结尾的 (...) 圆括号保留（通常是"标题 (原作名)"，是标题的一部分）
 *   - 中间剩下的就是标题
 */

// 方括号/圆括号分开匹配，避免一个块内嵌套另一种括号时把正则截断
// （例如 "[NT CONFESS (Enu Kei, Aburidashi Zakuro)]" 内部就嵌了一层圆括号）
const LEADING_SQUARE_RE = /^\s*\[[^\]]*\]\s*/
const LEADING_ROUND_RE = /^\s*[\(（][^\)）]*[\)）]\s*/

/** 结尾只匹配方括号块（圆括号在结尾时保留，视为标题的一部分） */
const TRAILING_SQUARE_RE = /\s*\[[^\]]*\]\s*$/

export function cleanImageDisplayName(rawName: string): string {
  let s = rawName.trim()
  if (!s) return rawName

  // 反复去掉开头的 (...) 或 [...] 块（各自独立匹配，防止嵌套括号截断）
  while (LEADING_SQUARE_RE.test(s) || LEADING_ROUND_RE.test(s)) {
    const next = s.replace(LEADING_SQUARE_RE, '').replace(LEADING_ROUND_RE, '').trim()
    if (next === s) break
    s = next
  }

  // 反复去掉结尾的 [...] 方括号块（圆括号不动）
  while (TRAILING_SQUARE_RE.test(s)) {
    const next = s.replace(TRAILING_SQUARE_RE, '').trim()
    if (next === s) break
    s = next
  }

  s = s.replace(/\s+/g, ' ').trim()
  return s || rawName
}
