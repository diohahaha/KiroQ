/**
 * 图片库右键菜单公用逻辑：构建"标记标签"子菜单 + 解析点击结果里的 tag id。
 * ImageLibraryPage.tsx / ImageDetailPage.tsx 两处都要用（文件夹级 + 文件级菜单都有"标记标签"）。
 */
import type { ContextMenuItem, ImageTagDef } from '@shared/types'

export function buildTagSubmenu(tagDefs: ImageTagDef[], currentTags: string[]): ContextMenuItem {
  return {
    id: 'tags',
    label: '🏷 标记标签',
    submenu: tagDefs.map(tag => ({
      id: `tag:${tag.id}`,
      label: tag.type === 'color' ? `● ${tag.label}` : `▢ ${tag.label}`,
      type: 'checkbox',
      checked: currentTags.includes(tag.id),
    })),
  }
}

/** 点击结果如果是 "tag:xxx" 这种标签子菜单项，返回切换后的新标签数组；否则返回 null（不是标签操作） */
export function resolveTagToggle(resultId: string, currentTags: string[]): string[] | null {
  if (!resultId.startsWith('tag:')) return null
  const tagId = resultId.slice('tag:'.length)
  return currentTags.includes(tagId)
    ? currentTags.filter(t => t !== tagId)
    : [...currentTags, tagId]
}
