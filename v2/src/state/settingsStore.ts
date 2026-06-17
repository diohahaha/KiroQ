import { create } from 'zustand'
import type { AppSettings, ThemePresetKey } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

const STORAGE_KEY = 'kiroq-settings'

// ═══════════════════════════════════════════
// 复刻旧版 config.py _blend() + _build_colors()
// ═══════════════════════════════════════════

function blend(hex1: string, hex2: string, ratio: number): string {
  const r1 = parseInt(hex1.slice(1,3),16), g1 = parseInt(hex1.slice(3,5),16), b1 = parseInt(hex1.slice(5,7),16)
  const r2 = parseInt(hex2.slice(1,3),16), g2 = parseInt(hex2.slice(3,5),16), b2 = parseInt(hex2.slice(5,7),16)
  const r = Math.round(r1+(r2-r1)*ratio), g = Math.round(g1+(g2-g1)*ratio), b = Math.round(b1+(b2-b1)*ratio)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

const DARK: Record<string,string> = {
  '--kq-bg-nav':'#1a1a2e','--kq-bg-detail':'#12121e','--kq-bg-card':'#1e1e2e',
  '--kq-bg-toolbar':'#111122','--kq-bg-primary':'#1a1a2e','--kq-bg-secondary':'#1e1e2e',
  '--kq-border':'#2a2a4a','--kq-border-pin':'#ffaa00','--kq-border-hover':'#5555aa',
  '--kq-text-primary':'#ccccdd','--kq-text-dim':'#666688','--kq-text-muted':'#888888',
  '--kq-desc-bg':'#151525','--kq-hover':'#2a2a4e','--kq-row-even':'#1a1a2e',
  '--kq-row-odd':'#161624','--kq-row-hover':'#252540',
  '--kq-cb-unchecked':'#333350','--kq-cb-hover':'#444466',
  '--kq-watched-bg':'#3a5a3a','--kq-watched-fg':'#88cc88','--kq-watched-text':'#3a4a3a',
  '--kq-unwatched-text':'#44445a','--kq-hidden-card':'#111118','--kq-canvas-bg':'#1a1a2e',
  '--kq-btn-toggle-a':'#1e1e3e','--kq-btn-toggle-b':'#2a3a2a','--kq-sep-color':'#2a2a4a',
  '--kq-toast-bg':'#1e3a1e','--kq-empty-text':'#444466','--kq-link-hover':'#2a2a4e',
  '--kq-crumb-sep':'#555577','--kq-crumb-mid':'#666688',
}
const LIGHT: Record<string,string> = {
  '--kq-bg-nav':'#e2e2ee','--kq-bg-detail':'#f2f2f7','--kq-bg-card':'#ffffff',
  '--kq-bg-toolbar':'#eaeaf2','--kq-bg-primary':'#e2e2ee','--kq-bg-secondary':'#ffffff',
  '--kq-border':'#c8c8dd','--kq-border-pin':'#cc8800','--kq-border-hover':'#7777cc',
  '--kq-text-primary':'#333344','--kq-text-dim':'#7777aa','--kq-text-muted':'#666688',
  '--kq-desc-bg':'#eaeaf5','--kq-hover':'#d8d8ee','--kq-row-even':'#f5f5fa',
  '--kq-row-odd':'#eeeef5','--kq-row-hover':'#ddddf0',
  '--kq-cb-unchecked':'#ccccdd','--kq-cb-hover':'#bbbbcc',
  '--kq-watched-bg':'#c8e6c8','--kq-watched-fg':'#448844','--kq-watched-text':'#3a6a3a',
  '--kq-unwatched-text':'#666688','--kq-hidden-card':'#d8d8e0','--kq-canvas-bg':'#e2e2ee',
  '--kq-btn-toggle-a':'#c8c8dd','--kq-btn-toggle-b':'#c8ddc8','--kq-sep-color':'#c8c8dd',
  '--kq-toast-bg':'#c8e6c8','--kq-empty-text':'#8888aa','--kq-link-hover':'#d8d8ee',
  '--kq-crumb-sep':'#8888aa','--kq-crumb-mid':'#666688',
}

const ACCENTS: Record<string,{accent:string,btn:string,btnHover:string}> = {
  blue:  {accent:'#3a6eaa',btn:'#1a3a5a',btnHover:'#2a4a6a'},
  purple:{accent:'#6a3aaa',btn:'#2a1a4a',btnHover:'#3a2a5a'},
  green: {accent:'#3a7a3a',btn:'#1a3a2a',btnHover:'#2a4a3a'},
  orange:{accent:'#aa6a2a',btn:'#3a2a1a',btnHover:'#5a3a2a'},
  red:   {accent:'#aa3a3a',btn:'#3a1a1a',btnHover:'#5a2a2a'},
  teal:  {accent:'#2a8a7a',btn:'#1a3a32',btnHover:'#2a5a4a'},
  pink:  {accent:'#aa4a7a',btn:'#3a1a2a',btnHover:'#5a2a3a'},
  gray:  {accent:'#6a6a7a',btn:'#2a2a32',btnHover:'#3a3a44'},
}

/** 复刻 _build_colors(): 背景染强调色 + 交互元素直接用强调色 */
function buildColors(mode:'dark'|'light', accentKey:string): Record<string,string> {
  const base = {...(mode === 'dark' ? DARK : LIGHT)}
  const a = ACCENTS[accentKey] || ACCENTS.blue
  const tint = mode === 'dark' ? 0.18 : 0.12  // 暗色混18%，亮色混12%

  // ① 背景染强调色
  const tintKeys = ['--kq-bg-nav','--kq-bg-detail','--kq-bg-card','--kq-bg-toolbar',
    '--kq-desc-bg','--kq-row-even','--kq-row-odd','--kq-canvas-bg','--kq-hidden-card',
    '--kq-toast-bg','--kq-sep-color','--kq-bg-primary','--kq-bg-secondary']
  for (const k of tintKeys) {
    if (base[k]) base[k] = blend(base[k], a.accent, tint)
  }

  // ② 交互元素直接用强调色
  base['--kq-border-hover'] = a.accent
  base['--kq-cb-checked'] = a.accent
  base['--kq-cb-hover'] = blend(a.accent, base['--kq-bg-card'] || '#1e1e2e', 0.5)
  base['--kq-crumb-last'] = a.accent
  base['--kq-link-hover'] = blend(a.accent, base['--kq-bg-nav'] || '#1a1a2e', 0.5)
  base['--kq-btn-toggle-a'] = a.btn
  base['--kq-btn-toggle-b'] = a.btnHover
  base['--kq-text-dim'] = blend(a.accent, mode==='dark'?'#ccccdd':'#333344', 0.45)
  base['--kq-empty-text'] = blend(a.accent, base['--kq-bg-detail']||'#12121e', 0.3)
  base['--kq-accent'] = a.accent
  base['--kq-accent-hover'] = blend(a.accent, '#ffffff', 0.2)
  base['--kq-btn'] = a.btn
  base['--kq-btn-hover'] = a.btnHover

  return base
}

/** 直接用 setProperty('important') 强写所有变量 */
function applyTheme(preset: ThemePresetKey): void {
  let mode: 'dark'|'light' = 'dark', accent = 'blue'
  if (preset === 'system') {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else if (preset.startsWith('light_')) {
    mode = 'light'; accent = preset.replace('light_','')
  } else if (preset.startsWith('dark_')) {
    mode = 'dark'; accent = preset.replace('dark_','')
  }
  const colors = buildColors(mode, accent)
  const root = document.documentElement
  for (const [k, v] of Object.entries(colors)) {
    root.style.setProperty(k, v, 'important')
  }
}

// ═══════════════════════════════════════════
// Store
// ═══════════════════════════════════════════
function load(): Partial<AppSettings> {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {} }
  catch { return {} }
}
function save(s: AppSettings) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) }

const saved = load()
applyTheme((saved.themePreset || 'dark_blue') as ThemePresetKey)

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS, ...load(), loaded: true,
  load: () => { const s = load(); set({...DEFAULT_SETTINGS,...s,loaded:true}); applyTheme((s.themePreset||'dark_blue') as ThemePresetKey) },
  setThemePreset: (key) => { applyTheme(key); set({themePreset:key}); save({...get(),themePreset:key} as AppSettings) },
  save: (partial) => { const c = get(); set(partial); save({...c,...partial} as AppSettings) },
}))

interface SettingsState extends AppSettings {
  loaded: boolean; load: () => void
  setThemePreset: (key: ThemePresetKey) => void
  save: (partial: Partial<AppSettings>) => void
}
