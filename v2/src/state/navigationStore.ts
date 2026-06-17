import { create } from 'zustand'

export interface NavEntry { path: string; name: string }

interface NavigationState {
  stack: NavEntry[]
  current: NavEntry | null
  push: (entry: NavEntry) => void
  pop: () => NavEntry | null
  reset: (entry: NavEntry) => void
  goHome: () => void
  /** 回到指定 entry（pop 到该条目之后） */
  goTo: (entry: NavEntry) => void
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  stack: [],
  current: null,

  push: (entry) => {
    const { stack } = get()
    // 如果目标已存在于栈中，截断到该位置
    const idx = stack.findIndex(e => e.path === entry.path)
    if (idx >= 0) {
      const newStack = stack.slice(0, idx + 1)
      set({ stack: newStack, current: entry })
      return
    }
    set(s => ({ stack: [...s.stack, entry], current: entry }))
  },

  pop: () => {
    const { stack } = get()
    if (stack.length <= 1) return null
    const newStack = stack.slice(0, -1)
    const prev = newStack[newStack.length - 1]
    set({ stack: newStack, current: prev })
    return prev
  },

  reset: (entry) => {
    set({ stack: [entry], current: entry })
  },

  goHome: () => {
    const { stack } = get()
    if (stack.length > 0) {
      const home = stack[0]
      set({ stack: [home], current: home })
    }
  },

  goTo: (entry) => {
    const { stack } = get()
    const idx = stack.findIndex(e => e.path === entry.path)
    if (idx >= 0) {
      const newStack = stack.slice(0, idx + 1)
      set({ stack: newStack, current: entry })
    }
  },
}))
