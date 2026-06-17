/**
 * Bangumi API — 用 electron.net.fetch（走 Chromium 代理，解决国内超时）
 */
import { ipcMain, net } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { IPC } from '../../shared/types'

const API = 'https://api.bgm.tv'

async function fetchJson(url: string): Promise<any> {
  const resp = await net.fetch(url, {
    headers: { 'User-Agent': 'KiroQ/2.0', Accept: 'application/json' },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

async function downloadFile(url: string, savePath: string): Promise<boolean> {
  try {
    const resp = await net.fetch(url, {
      headers: { 'User-Agent': 'KiroQ/2.0' },
    })
    if (!resp.ok) return false
    const buf = await resp.arrayBuffer()
    fs.writeFileSync(savePath, Buffer.from(buf))
    return true
  } catch { return false }
}

export function registerBangumiIpc(): void {
  ipcMain.handle(IPC.BANGUMI_SEARCH, async (_e, keyword: string) => {
    console.log('[bangumi] search:', keyword)
    try {
      const resp = await fetchJson(
        `${API}/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=large&max_results=6`
      )
      const results = (resp.list || []).map((item: any) => ({
        id: item.id,
        name: item.name || '',
        name_cn: item.name_cn || item.name || '',
        image: (item.images || {}).large || '',
        summary: item.summary || '',
        air_date: item.air_date || '',
        eps: item.eps_count || 0,
        rating: (() => { const r = item.rating; if (typeof r === 'number') return r; if (r?.score != null) return r.score; return null; })(),
      }))
      console.log('[bangumi] found:', results.length)
      return results
    } catch (e: any) {
      console.warn('[bangumi] search error:', e.message)
      return []
    }
  })

  ipcMain.handle(IPC.BANGUMI_GET_SUBJECT, async (_e, subjectId: number) => {
    try {
      const item = await fetchJson(`${API}/v0/subjects/${subjectId}`)
      return {
        id: item.id, name: item.name || '',
        name_cn: item.name_cn || item.name || '',
        image: (item.images || {}).large || '',
        summary: item.summary || '',
        air_date: item.date || '', eps: item.eps || 0,
        rating: (() => { const r = item.rating; if (typeof r === 'number') return r; if (r?.score != null) return r.score; return null; })(),
      }
    } catch { return null }
  })

  ipcMain.handle(IPC.BANGUMI_DOWNLOAD_COVER, async (_e, url: string, saveDir: string) => {
    if (!url) return null
    const savePath = path.join(saveDir, `cover_${Date.now()}.jpg`)
    const ok = await downloadFile(url, savePath)
    return ok ? savePath : null
  })

  // 通用 JSON 抓取（自定义来源用）
  ipcMain.handle('generic:fetchJson', async (_e, url: string) => {
    try {
      return await fetchJson(url)
    } catch (e: any) {
      console.warn('[generic:fetchJson] failed:', e.message)
      return null
    }
  })
}
