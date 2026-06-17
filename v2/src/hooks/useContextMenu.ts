import { useCallback } from 'react'
import type { ContextMenuItem } from '@shared/types'

/**
 * 右键菜单 hook：封装 IPC 调用，组件只需传入菜单项和回调。
 */
export function useContextMenu() {
  const show = useCallback(
    async (items: ContextMenuItem[]): Promise<string | null> => {
      return window.api.showContextMenu(items)
    },
    [],
  )

  return { show }
}
