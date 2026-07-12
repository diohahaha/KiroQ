/**
 * 图片库封面提取服务。
 * 三条路径：
 *   图片文件      → 读原图，用 nativeImage 缩到 600px 长边再存（避免几千像素的
 *                    扫描原图直接进缓存，卡片一多加载/解码就卡）
 *   zip / cbz     → adm-zip 解包，按文件名自然排序取第一张图片，同样缩放后存
 *   epub          → adm-zip 解包，解析 META-INF/container.xml → OPF 清单，
 *                    优先取 EPUB3 properties="cover-image"，其次 <meta name="cover">，
 *                    都找不到则返回 null（前端书本图标兜底，不影响文件显示）
 *   txt           → 直接返回 null
 *
 * 复用 electron/services/thumbnail.ts 的缓存目录 + kiroq://thumbnail/{hash} 协议，
 * 不需要新开一个 protocol。
 */
import * as fs from 'fs'
import * as path from 'path'
// @ts-ignore  — 需要 npm i adm-zip @types/adm-zip
import AdmZip from 'adm-zip'
// @ts-ignore  — 需要 npm i yauzl @types/yauzl
import * as yauzl from 'yauzl'
import { nativeImage } from 'electron'
import { thumbnailPath, thumbnailExists } from './thumbnail'
import { logCoverError } from './coverErrorLog'
import type { ImageResourceKind } from '../../shared/types'

const IMG_EXT_RE = /\.(jpe?g|png|webp|bmp|gif|jfif|avif|tiff?)$/i

// 缩略图缩到长边这么多像素再存盘。留这么大是因为有缩放滑条功能，卡片可以拖到
// 最大 240px 宽，高分屏（Retina/高 DPI）实际渲染像素还要再乘 2，大概需要
// ~480px 的图源才不会糊，600px 留了点余量。比原图（漫画扫描通常几千像素起步）
// 小了 5-10 倍，该省的解码开销和内存占用都省下来了。
const THUMBNAIL_MAX_DIM = 600

/**
 * 用 Electron 自带的 nativeImage 缩放（不需要装 sharp 这种原生模块，Electron
 * 本来就内置了图片解码/缩放能力，直接复用）。缩放失败就返回原图——好歹能看，
 * 比因为缩放报错就整个没封面强。
 */
function resizeToThumbnail(buf: Buffer): Buffer {
  try {
    const img = nativeImage.createFromBuffer(buf)
    const { width, height } = img.getSize()
    if (width === 0 || height === 0) return buf // 解析不出尺寸（格式不认识），原样返回
    if (width <= THUMBNAIL_MAX_DIM && height <= THUMBNAIL_MAX_DIM) return buf // 本来就够小，不用缩

    const resized = width >= height
      ? img.resize({ width: THUMBNAIL_MAX_DIM })
      : img.resize({ height: THUMBNAIL_MAX_DIM })
    const out = resized.toJPEG(85)
    return out.length > 0 ? out : buf
  } catch {
    return buf
  }
}

// 超过这个大小的压缩包/epub，自动扫描的时候直接跳过解压，不生成封面
// （前端书本图标兜底）。adm-zip 打开文件时会把整个文件一次性读进内存，
// 文件越大这一步就越慢，所以自动/后台扫描保持一个保守的默认值。
// 超过这个值的文件不是彻底没救——详情页工具栏"⚡ 获取超大文件封面"按钮
// 可以针对这些被跳过的文件手动强制重试（见 generateImageCover 的 force 参数），
// 默认的自动扫描行为不受影响。
export const MAX_ARCHIVE_SIZE = 300 * 1024 * 1024 // 300MB

// "获取超大文件封面"按钮的 force 模式无视 MAX_ARCHIVE_SIZE，但不能完全没有底线——
// adm-zip 打开文件是把整个文件一次性读进内存，真遇到几个 GB 的文件，不只是慢，
// 是有可能把 Node 进程内存吃到崩溃的。这个绝对上限就算 force=true 也不能突破，
// 超过了直接放弃并写日志说明原因，不会尝试。
export const ABSOLUTE_MAX_SIZE = 3 * 1024 * 1024 * 1024 // 3GB

function tooLargeToProcess(filePath: string, force: boolean): boolean {
  try {
    const size = fs.statSync(filePath).size
    if (size > ABSOLUTE_MAX_SIZE) return true // force 也没用，绝对上限
    return !force && size > MAX_ARCHIVE_SIZE
  } catch {
    return false
  }
}

/**
 * "解不开"的文件不要每次进文件夹都重新尝试一遍。
 * 之前的问题：某个压缩包加密/损坏，这次进文件夹尝试解压失败，下次再进这个
 * 文件夹（甚至只是切换筛选触发重新渲染）会原样再尝试一次同样耗时的解压，
 * 每次都要重新付一遍这个代价，体感就是"这个文件夹每次进去都卡"。
 * 用一个内存里的失败记录表（软件重启后自然清空，不做持久化，够用）：
 * 同一个文件、大小和修改时间都没变过，说明还是那个解不开的文件，直接跳过。
 */
const failedCache = new Map<string, string>() // filePath -> `${size}:${mtimeMs}` 指纹

function fingerprint(filePath: string): string | null {
  try {
    const st = fs.statSync(filePath)
    return `${st.size}:${st.mtimeMs}`
  } catch {
    return null
  }
}

function isKnownFailed(filePath: string): boolean {
  const fp = fingerprint(filePath)
  return fp != null && failedCache.get(filePath) === fp
}

function markFailed(filePath: string): void {
  const fp = fingerprint(filePath)
  if (fp) failedCache.set(filePath, fp)
}

/** 手动"重新获取封面"用：清掉这个文件的失败记忆，下次请求就会真的重新尝试 */
export function clearFailedCache(filePath: string): void {
  failedCache.delete(filePath)
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * zip/cbz 内按自然顺序找第一张能成功解出来的图片，返回 Buffer，全部失败才返回 null。
 *
 * 之前的版本只取"排序后的第一个图片条目"，用一个外层 try/catch 包住整个函数——
 * 如果恰好第一张图片本身有问题（比如那一个条目被加密、CRC 损坏、压缩方式不支持），
 * 会直接判定整个压缩包"提取失败"返回 null，明明后面的图片可能完全没问题。
 * 改成逐个候选往后试，只有全部都失败才真的放弃（前端书本图标兜底）。
 */
// yauzl 的几个操作都是回调式 API，包一层 Promise 方便用 async/await 写整个流程
function yauzlOpen(zipPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err: Error | null, zipfile: any) => {
      if (err) reject(err); else resolve(zipfile)
    })
  })
}

function yauzlCollectEntries(zipfile: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const entries: any[] = []
    zipfile.on('entry', (entry: any) => { entries.push(entry); zipfile.readEntry() })
    zipfile.on('end', () => resolve(entries))
    zipfile.on('error', reject)
    zipfile.readEntry()
  })
}

function yauzlReadEntry(zipfile: any, entry: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err: Error | null, stream: any) => {
      if (err) { reject(err); return }
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}

/**
 * zip/cbz 内按自然顺序找第一张能成功解出来的图片，返回 Buffer，全部失败才返回 null。
 *
 * 换成 yauzl 而不是 adm-zip，两个原因都是实测踩过的坑：
 *   1. adm-zip 打开文件是把整个文件一次性读进内存，文件越大这一步就越慢/越占内存；
 *      yauzl 只读 central directory（文件列表），需要哪个条目才单独读流那一部分，
 *      不管压缩包多大，内存占用只跟"当前正在读的这一个条目"有关。
 *   2. adm-zip 对老式 ZIP 32 位字段的 2GB(准确说 2^31-1 字节) 上限支持不完整，
 *      超过这个体积的压缩包（哪怕用了 Zip64 扩展格式描述大小）直接打不开；
 *      yauzl 对 Zip64 的支持更完整，能正常处理超过 2GB 的压缩包。
 *
 * 逐个候选往后试的逻辑不变：某一张图片本身有问题（加密/损坏）就换下一张，
 * 全部都解不开才真的放弃。
 */
async function firstImageFromZip(zipPath: string, force = false): Promise<Buffer | null> {
  if (tooLargeToProcess(zipPath, force)) {
    const size = (() => { try { return fs.statSync(zipPath).size } catch { return 0 } })()
    const limitMB = size > ABSOLUTE_MAX_SIZE ? ABSOLUTE_MAX_SIZE / 1024 / 1024 : MAX_ARCHIVE_SIZE / 1024 / 1024
    logCoverError(zipPath, `文件超过 ${limitMB}MB 上限，跳过解压${size > ABSOLUTE_MAX_SIZE ? '（绝对上限，强制模式也不处理）' : ''}`)
    return null
  }

  let zipfile: any
  try {
    zipfile = await yauzlOpen(zipPath)
  } catch (e) {
    // 压缩包本身打不开：加密整包、不是有效 zip、central directory 损坏等
    logCoverError(zipPath, `压缩包无法打开: ${(e as Error).message}`)
    return null
  }

  let entries: any[]
  try {
    const all = await yauzlCollectEntries(zipfile)
    entries = all
      .filter((e: any) => !/\/$/.test(e.fileName) && IMG_EXT_RE.test(e.fileName))
      .sort((a: any, b: any) => naturalSort(a.fileName, b.fileName))
  } catch (e) {
    logCoverError(zipPath, `读取压缩包目录失败: ${(e as Error).message}`)
    try { zipfile.close() } catch { /* 忽略 */ }
    return null
  }

  if (entries.length === 0) {
    logCoverError(zipPath, '压缩包内没有找到任何符合已知图片扩展名的条目')
    try { zipfile.close() } catch { /* 忽略 */ }
    return null
  }

  for (const entry of entries) {
    try {
      const buf = await yauzlReadEntry(zipfile, entry)
      if (buf && buf.length > 0) { try { zipfile.close() } catch {} return buf }
    } catch (e) {
      // 这一张图片解不出来（该条目加密/损坏），继续试下一张，不要整体放弃
      logCoverError(zipPath, `条目 ${entry.fileName} 解压失败(已尝试下一张): ${(e as Error).message}`)
      continue
    }
  }
  // 压缩包里所有候选图片都解不出来（比如整包被加密），只能放弃
  logCoverError(zipPath, '压缩包内所有图片候选均解压失败')
  try { zipfile.close() } catch { /* 忽略 */ }
  return null
}

/** epub 内解析封面图片，返回 Buffer，找不到返回 null */
function coverFromEpub(epubPath: string, force = false): Buffer | null {
  if (tooLargeToProcess(epubPath, force)) {
    const size = (() => { try { return fs.statSync(epubPath).size } catch { return 0 } })()
    const limitMB = size > ABSOLUTE_MAX_SIZE ? ABSOLUTE_MAX_SIZE / 1024 / 1024 : MAX_ARCHIVE_SIZE / 1024 / 1024
    logCoverError(epubPath, `文件超过 ${limitMB}MB 上限，跳过解压${size > ABSOLUTE_MAX_SIZE ? '（绝对上限，强制模式也不处理）' : ''}`)
    return null
  }
  try {
    const zip = new AdmZip(epubPath)

    const containerEntry = zip.getEntry('META-INF/container.xml')
    if (!containerEntry) return null
    const containerXml = containerEntry.getData().toString('utf-8')
    const opfMatch = containerXml.match(/full-path="([^"]+)"/)
    if (!opfMatch) return null
    const opfPath = opfMatch[1]

    const opfEntry = zip.getEntry(opfPath)
    if (!opfEntry) return null
    const opfXml = opfEntry.getData().toString('utf-8')
    const opfDir = path.posix.dirname(opfPath)

    // 1) EPUB3: <item ... properties="cover-image" ... href="xxx"/>
    let href: string | null = null
    const itemsRe = /<item\b[^>]*>/gi
    let m: RegExpExecArray | null
    while ((m = itemsRe.exec(opfXml))) {
      const tag = m[0]
      if (/properties="[^"]*cover-image[^"]*"/i.test(tag)) {
        const h = tag.match(/href="([^"]+)"/)
        if (h) { href = h[1]; break }
      }
    }

    // 2) EPUB2: <meta name="cover" content="cover-id"/> + <item id="cover-id" href="xxx"/>
    if (!href) {
      const metaMatch = opfXml.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)
      if (metaMatch) {
        const coverId = metaMatch[1]
        const idRe = new RegExp(`<item\\b[^>]*id="${coverId}"[^>]*>`, 'i')
        const idMatch = opfXml.match(idRe)
        if (idMatch) {
          const h = idMatch[0].match(/href="([^"]+)"/)
          if (h) href = h[1]
        }
      }
    }

    if (!href) return null
    const resolved = path.posix.normalize(path.posix.join(opfDir, href))
    const imgEntry = zip.getEntry(resolved)
    if (!imgEntry) return null
    return imgEntry.getData()
  } catch (e) {
    logCoverError(epubPath, `epub 封面解析失败: ${(e as Error).message}`)
    return null
  }
}

/**
 * 生成/读取封面缓存，返回缓存文件路径；找不到封面返回 null（前端书本图标兜底）。
 * coverId：md5(filePath) 之类的稳定 hash，由调用方（IPC 层）生成，这里只负责写盘。
 * force=true：手动"获取超大文件封面"按钮用——无视体积上限、无视失败记忆，强制真的
 * 重新尝试一次（成功了会覆盖旧的失败记忆，让以后自动请求也能直接命中这次的结果）。
 */
export async function generateImageCover(
  sourcePath: string,
  kind: ImageResourceKind,
  coverId: string,
  force = false,
): Promise<string | null> {
  const output = thumbnailPath(coverId)
  if (!force && thumbnailExists(coverId) && fs.statSync(output).size > 0) return output

  // 之前试过、文件没变过、上次就是解不开 —— 不要再浪费时间重新尝试一次
  // （force=true 时跳过这个检查，因为用户就是要强制重试）
  if (!force && isKnownFailed(sourcePath)) return null

  let buf: Buffer | null = null
  if (kind === 'image') {
    try { buf = fs.readFileSync(sourcePath) } catch { buf = null }
  } else if (kind === 'archive') {
    buf = await firstImageFromZip(sourcePath, force)
  } else if (kind === 'ebook') {
    if (sourcePath.toLowerCase().endsWith('.epub')) buf = coverFromEpub(sourcePath, force)
    // .txt 没有封面，buf 保持 null
  }
  // kind === 'video' / 'other' 不在这里处理，video 走视频库现成的 ffmpeg 缩略图
  // （见 electron/ipc/imageLibrary.ts），other 直接没有封面可提取。

  if (!buf) {
    markFailed(sourcePath)
    return null
  }
  try {
    fs.writeFileSync(output, resizeToThumbnail(buf))
    return output
  } catch (e) {
    logCoverError(sourcePath, `封面写盘失败: ${(e as Error).message}`)
    markFailed(sourcePath)
    return null
  }
}
