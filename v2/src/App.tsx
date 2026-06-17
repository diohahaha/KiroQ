/**
 * 顶层组件：NavBar 始终可见 + 页面路由 + 全局弹窗
 */
import { useEffect, useCallback } from 'react'
import { PageTransition } from '@/components/layout/PageTransition'
import { NavBar } from '@/components/layout/NavBar'
import { LibraryPage } from '@/pages/LibraryPage'
import { DetailPage } from '@/pages/DetailPage'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { EditDialog } from '@/components/dialogs/EditDialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { useNavigationStore } from '@/state/navigationStore'
import { useSettingsStore } from '@/state/settingsStore'
import { useUiStore } from '@/state/uiStore'
import { useLibraryStore } from '@/state/libraryStore'
import { np } from '@/utils/path'

export function App() {
  const current = useNavigationStore(s => s.current)
  const reset = useNavigationStore(s => s.reset)
  const loadSettings = useSettingsStore(s => s.load)
  const activeModal = useUiStore(s => s.activeModal)
  const confirmState = useUiStore(s => s.confirmState)
  const editFolderPath = useUiStore(s => s.editFolderPath)
  const closeModal = useUiStore(s => s.closeModal)
  const openModal = useUiStore(s => s.openModal)
  const data = useLibraryStore(s => s.data)
  const loadData = useLibraryStore(s => s.load)

  useEffect(() => { loadSettings(); loadData() }, [loadSettings, loadData])

  // 有根目录但导航栈为空 → 自动初始化
  useEffect(() => {
    if (data.root && (!current || current.path !== data.root)) {
      const { stack } = useNavigationStore.getState()
      if (stack.length === 0) {
        reset({ path: np(data.root), name: '首页' })
      }
    }
  }, [data.root, current, reset])

  const handlePickRoot = useCallback(async () => {
    const path = await window.api.pickFolder()
    if (!path) return
    // setRoot 返回的 data 里 root 已归一化
    const newData = await (window.api as any).setRoot(path)
    if (newData?.root) {
      // 直接用 store 的 setState 同步更新，确保 data.root 立即可用
      useLibraryStore.setState({ data: newData })
    }
    reset({ path: np(path), name: '首页' })
  }, [reset])

  // 判断是否在根目录：统一归一化后比较
  const isRoot = !current || np(current.path) === np(data.root)

  const editMeta = editFolderPath ? data.folderMeta[editFolderPath] || null : null

  return (
    <div className="h-full flex flex-col">
      <NavBar onPickRoot={handlePickRoot} onOpenSettings={() => openModal('settings')} />

      <PageTransition page={{ type: isRoot ? 'library' : 'detail', videoId: current?.path }}>
        {isRoot ? <LibraryPage /> : <DetailPage folderPath={current!.path} />}
      </PageTransition>

      <SettingsDialog open={activeModal === 'settings'} onClose={closeModal} />
      <EditDialog open={activeModal === 'edit'} folderPath={editFolderPath} meta={editMeta}
        onSave={(partial) => { if (editFolderPath) useLibraryStore.getState().updateMeta(editFolderPath, partial) }}
        onClose={closeModal} />
      <ConfirmDialog open={activeModal === 'confirm'} title={confirmState?.title || '确认'}
        message={confirmState?.message || ''}
        onConfirm={() => { confirmState?.onConfirm(); closeModal() }}
        onCancel={closeModal} />
    </div>
  )
}
