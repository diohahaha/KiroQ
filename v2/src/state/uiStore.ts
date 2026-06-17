import { create } from 'zustand'

type ModalType = 'settings' | 'edit' | 'confirm' | 'bangumi' | null

interface ConfirmState {
  title: string
  message: string
  onConfirm: () => void
}

interface UiState {
  searchQuery: string
  filterQuery: string
  activeModal: ModalType
  confirmState: ConfirmState | null
  editFolderPath: string | null

  setSearchQuery: (q: string) => void
  setFilterQuery: (q: string) => void
  openModal: (modal: ModalType) => void
  closeModal: () => void
  showConfirm: (state: ConfirmState) => void
  setEditFolderPath: (path: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  searchQuery: '',
  filterQuery: '',
  activeModal: null,
  confirmState: null,
  editFolderPath: null,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterQuery: (q) => set({ filterQuery: q }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  showConfirm: (state) => set({ activeModal: 'confirm', confirmState: state }),
  setEditFolderPath: (path) => set({ editFolderPath: path }),
}))
