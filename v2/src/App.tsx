/**
 * 顶层组件：NavBar 始终可见 + 页面路由 + 全局弹窗
 * ── 本版追加：视频库/图片库切换 ──
 * 两个库共用同一个 navigationStore（单一 stack），切换库模式时把 stack 重置到
 * 对应库的根目录，这样面包屑、goHome 等逻辑完全不用改。
 */
import { useEffect, useCallback, useState } from 'react'
import { PageTransition } from '@/components/layout/PageTransition'
import { NavBar } from '@/components/layout/NavBar'
import { LibraryPage } from '@/pages/LibraryPage'
import { DetailPage } from '@/pages/DetailPage'
import { ImageLibraryPage } from '@/pages/ImageLibraryPage'
import { ImageDetailPage } from '@/pages/ImageDetailPage'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { EditDialog } from '@/components/dialogs/EditDialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { SkeletonScreen } from '@/components/common/SkeletonScreen'
import { useNavigationStore } from '@/state/navigationStore'
import { useSettingsStore } from '@/state/settingsStore'
import { useUiStore } from '@/state/uiStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useImageLibraryStore } from '@/state/imageLibraryStore'
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
  const imageData = useImageLibraryStore(s => s.data)
  const loadImageData = useImageLibraryStore(s => s.load)

  // settingsStore 是同步从 localStorage 加载的（模块加载时就跑完了 load()），
  // 不需要 subscribe/等待，直接在初始化函数里取当前值即可。
  const [libraryMode, setLibraryMode] = useState<'video' | 'image'>(
    () => useSettingsStore.getState().defaultLibraryMode,
  )

  // 冷启动骨架屏：loadData/loadImageData 是走 IPC 读磁盘文件的，哪怕正常情况
  // 下很快，也不是 0 耗时——之前这段时间界面是纯白的，现在显示骨架屏占位。
  // Promise.resolve(...) 包一层是因为不确定这两个 action 是不是一定返回
  // promise（有的 store 实现可能是同步的），统一按"可能是异步"处理最安全。
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    loadSettings()
    Promise.all([Promise.resolve(loadData()), Promise.resolve(loadImageData())])
      .finally(() => setInitialLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 当前库模式对应的根目录
  const currentRoot = libraryMode === 'video' ? data.root : imageData.root

  // 有根目录但导航栈没对上当前库的根 → 重置到该库首页
  // （覆盖：首次加载、切库、以及图片库刚设置完根目录这几种情况）
  useEffect(() => {
    if (!currentRoot) return
    const stack = useNavigationStore.getState().stack
    if (stack.length === 0 || np(stack[0].path) !== np(currentRoot)) {
      reset({ path: np(currentRoot), name: '首页' })
    }
  }, [libraryMode, currentRoot, reset])

  const handlePickRoot = useCallback(async () => {
    const path = await window.api.pickFolder()
    if (!path) return
    if (libraryMode === 'video') {
      const newData = await (window.api as any).setRoot(path)
      if (newData?.root) useLibraryStore.setState({ data: newData })
    } else {
      await useImageLibraryStore.getState().setRoot(path)
    }
    reset({ path: np(path), name: '首页' })
  }, [reset, libraryMode])

  const handleSwitchLibraryMode = useCallback((mode: 'video' | 'image') => {
    setLibraryMode(mode)
    // 具体的 reset 交给上面那个 useEffect（依赖 currentRoot 变化）处理，
    // 这里不用重复判断，避免和 effect 打架。
  }, [])

  // 判断是否在根目录：统一归一化后比较
  const isRoot = !current || np(current.path) === np(currentRoot)

  const editMeta = editFolderPath ? data.folderMeta[editFolderPath] || null : null

  if (initialLoading) {
    return <SkeletonScreen />
  }

  return (
    <div className="h-full flex flex-col">
      <NavBar
        onPickRoot={handlePickRoot}
        onOpenSettings={() => openModal('settings')}
        libraryMode={libraryMode}
        onSwitchLibraryMode={handleSwitchLibraryMode}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 首页：视频库/图片库常驻挂载，只切 CSS 显隐，完全不进 PageTransition
           那套 AnimatePresence，进/退详情页都不会连累它重新挂载 */}
        <div style={{ display: isRoot && libraryMode === 'video' ? 'contents' : 'none' }}>
          <LibraryPage />
        </div>
        <div style={{ display: isRoot && libraryMode === 'image' ? 'contents' : 'none' }}>
          <ImageLibraryPage />
        </div>

        {/* 详情页：单独走滑入滑出转场，只在“有没有详情页”这件事上触发动画 */}
        <PageTransition show={!isRoot} page={{ type: 'detail', videoId: current?.path }}>
          {libraryMode === 'video' ? (
            !isRoot && <DetailPage folderPath={current!.path} />
          ) : (
            !isRoot && <ImageDetailPage folderPath={current!.path} />
          )}
        </PageTransition>
      </div>

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
