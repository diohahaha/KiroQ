/**
 * 旧数据一次性迁移脚本：~/.kiroq_data.json → 新版 kiroq-data.json
 * 字段结构几乎 1:1，只需补全缺失字段。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { AppData, MigrationResult } from '../../shared/types'

const OLD_FILE = path.join(os.homedir(), '.kiroq_data.json')
// 也很早的旧文件名
const VERY_OLD_FILE = path.join(os.homedir(), '.anime_tracker_data.json')

export function migrateOldData(): MigrationResult & { data?: AppData } {
  const result: MigrationResult = { migrated: 0, skipped: 0, total: 0, errors: [] }

  // 找到旧文件
  let oldPath = ''
  if (fs.existsSync(OLD_FILE)) oldPath = OLD_FILE
  else if (fs.existsSync(VERY_OLD_FILE)) oldPath = VERY_OLD_FILE
  else return result

  let oldData: any
  try {
    oldData = JSON.parse(fs.readFileSync(oldPath, 'utf-8'))
  } catch (e) {
    result.errors.push(`Parse failed: ${e}`)
    return result
  }

  // 映射到新结构
  const newData: AppData = {
    version: 1,
    root: path.normalize(oldData.root || ''),
    watched: {},
    folderMeta: {},
    sortKey: oldData.sort_key || 'name',
    sortDesc: oldData.sort_desc || false,
    lastWatchedTime: {},
    addedTime: {},
    pinned: (oldData.pinned || []).map((p: string) => path.normalize(p)),
    hidden: (oldData.hidden || []).map((p: string) => path.normalize(p)),
    videoDurations: oldData.video_durations || {},
  }

  // 迁移 watched
  if (oldData.watched) {
    for (const [fp, vlist] of Object.entries(oldData.watched)) {
      const normFp = path.normalize(fp)
      newData.watched[normFp] = (vlist as string[]).map(v => path.normalize(v))
      result.total++
      result.migrated++
    }
  }

  // 迁移 folder_meta
  if (oldData.folder_meta) {
    for (const [fp, meta] of Object.entries(oldData.folder_meta)) {
      const m = meta as any
      const normFp = path.normalize(fp)
      newData.folderMeta[normFp] = {
        path: normFp,
        name: m.name || '',
        desc: m.desc || '',
        cover: m.cover || '',
        link: m.link || '',
        note: m.note || '',
        rating: m.rating ?? null,
        status: m.status || '',
        source: m.source || 'bangumi',
        bgmId: m.bgm_id ?? null,
        fetched: m.fetched || false,
        videoViewMode: m.video_view_mode || 'list',
        addedAt: 0,
      }
    }
  }

  // 迁移 last_watched_time / added_time
  if (oldData.last_watched_time) {
    for (const [fp, ts] of Object.entries(oldData.last_watched_time)) {
      newData.lastWatchedTime[path.normalize(fp)] = ts as number
    }
  }
  if (oldData.added_time) {
    for (const [fp, ts] of Object.entries(oldData.added_time)) {
      newData.addedTime[path.normalize(fp)] = ts as number
    }
  }

  return { ...result, data: newData }
}
