/**
 * 文件夹名清洗 — 复刻旧版 utils.py clean_search_keyword()
 * 去掉压制组/分辨率/编码/字幕/年份等噪声，提取纯标题
 */

// 噪声关键词（和旧版一致）
const NOISE = new Set([
  '1080p','1080P','720p','720P','480p','480P','2160p','2160P','4K','4k','8K',
  'HEVC','AVC','H264','H265','x264','x265','AV1','H.264','H.265',
  'HEVC-10bit','HEVC 10bit','Hi10p','Hi10P','8bit','10bit',
  'FLAC','AAC','DDP','Atmos','TrueHD','DTS','DTS-HD','DTS-HDMA','MA','OPUS','PCM','AC3','EAC3',
  'MKV','MP4','AVI','RMVB','MOV','WMV','M2TS','TS',
  'BDRip','BDrip','BDRIP','BluRay','BLURAY','Blu-ray','WEB-DL','WEB DL',
  'WEBRip','WEB Rip','DVDRip','DVD','BD','Remux','REMUX',
  'TV','OVA','OAD','ONA','SP','MOVIE','TV+OVA','TV+OVA+SP','OVA+SP',
  '简繁内封','简繁','内封简繁','内封简繁中字','内封中字','内封',
  '简繁中字','简中','繁中','中字','外挂','外挂字幕',
  '中日双语','日文','中文','英文',
  'CHS','CHT','JPSC','GB','BIG5','SC','TC',
  '特典映像','映像特典','特典','SP特典','OVA特典',
  'NCED','NCOP','NCEDOP','NC','OP','ED','PV','CM','Menu',
  'Creditless','creditless','credit','Credit',
  '60fps','120fps','补帧','补幀',
  '全集','TV全集','Repack','repack','Rerip','rerip','v2','v3','rev','Fix','fix',
  'Limited','LIMITED','Limited Edition',
])

// 压制组/字幕组名称模式
const GROUP_PATTERNS = [
  /DBD[-]?Raws/i, /VCB[-]?(Studio|_S)?/i, /LoliHouse/i, /Snow[-]?Raws/i,
  /Moozzi2/i, /ReinForce/i, /jsum/i, /UCCUSS/i,
  /mawen1250/i, /LittleBakas/i, /AI[-]?Raws/i,
  /Philosophy[-]?raws/i, /UHA[-]?WINGS/i, /CASO/i,
  /SumiSora/i, /FLsnow/i, /DMG/i, /EMTP[-]?Raws/i,
  /LowPower[-]?Raws/i, /IrizaRaws/i, /Koten_Gars/i,
  /ank[-]?raws/i, /SEED/i,
  /Yousei[-]?Raws/i, /Beatrice[-]?Raws/i, /KawaiiRaws/i,
  /Kamigami/i, /Comicat/i, /KissSub/i, /HYSUB/i, /KNA/i,
  /Subsplease/i, /Erai[-]?raws/i, /HorribleSubs/i,
  /Owlolf/i, /NanDesuKa/i, /EMBER/i, /Judas/i,
  /ASW/i, /ToonsHub/i, /Samaritan/i,
]

function looksLikeNoise(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^\d{4}$/.test(t)) return true              // 年份
  if (/^\d{4}[-~]\d{4}$/.test(t)) return true      // 年份范围
  if (/^\d{3,4}[xX×]\d{3,4}$/.test(t)) return true // 分辨率
  if (/^\d+$/.test(t)) return true                   // 纯数字
  if (NOISE.has(t)) return true
  if (/\d{1,3}[-~]\d{1,3}.*(?:全集|集|话|TV|OVA|特典|映像|SP|\+)/.test(t)) return true
  if (/(?:全集|特典映像|映像特典|特典映像)/.test(t)) return true
  for (const p of GROUP_PATTERNS) {
    if (p.test(t)) return true
  }
  if (/^[A-Za-z0-9\-+_\.]{3,24}$/.test(t)) return true
  if (/(?:字幕|压制|编码|封装|补帧|修复|调轴|内[封嵌]|外挂)/.test(t)) return true
  // 多词组合
  const tokens = t.split(/[\s\._]+/)
  if (tokens.length >= 2) {
    const noiseCount = tokens.filter(tok => {
      const tk = tok.trim()
      if (/^\d+[pPkK]$/.test(tk)) return true
      if (/^\d{3,4}[xX×]\d{3,4}$/.test(tk)) return true
      if (/^\d+$/.test(tk)) return true
      if (/^[A-Za-z0-9\-+_\.]{2,10}$/.test(tk) && NOISE.has(tk)) return true
      return false
    }).length
    if (noiseCount >= tokens.length / 2) return true
  }
  return false
}

/**
 * 清洗文件夹名：提取可用于搜索/显示的关键词
 * 支持两种命名格式：
 *   A) 年份前缀 + 多语言标题 + 媒体类型后缀
 *   B) 多段方括号 [压制组][标题][分辨率][编码][字幕]...
 */
export function cleanSearchKeyword(folderName: string): string {
  let kw = folderName.trim()

  // 提取方括号内容
  const brackets: string[] = []
  kw.replace(/\[([^\]]+)\]/g, (_, content) => {
    brackets.push(content)
    return ''
  })

  const titleFromBrackets = brackets.filter(b => !looksLikeNoise(b))

  // 清洗方括号外内容
  let outside = kw.replace(/\[[^\]]+\]/g, ' ').replace(/_/g, ' ').replace(/\./g, ' ')
  outside = outside.replace(/\([^)]*\)/g, ' ')
  const noisePats = [
    /\b\d{4}[-~]\d{4}\b/g, /\b\d{4}\b/g, /\b\d{3,4}[xX×]\d{3,4}\b/g,
    /\b1080[pP]\b/g, /\b720[pP]\b/g, /\b2160[pP]\b/g, /\b480[pP]\b/g,
    /\bBDRip\b/gi, /\bBluRay\b/gi, /\bWEB-?DL\b/gi, /\bWEBRip\b/gi, /\bDVDRip\b/gi,
    /\bFLAC\b/gi, /\bAAC\b/gi, /\bHEVC\b/gi, /\bAVC\b/gi,
    /\bMKV\b/gi, /\bMP4\b/gi, /\bAVI\b/gi, /\bRMVB\b/gi,
    /\bx264\b/gi, /\bx265\b/gi, /\bAV1\b/gi,
    /\bBD\b/gi, /\bDVD\b/gi, /\bRemux\b/gi,
    /\bTV\b/gi, /\bOVA\b/gi, /\bMOVIE\b/gi, /\bSP\b/gi, /\bOAD\b/gi, /\bONA\b/gi,
    /\bHi10p\b/gi, /\b10bit\b/gi, /\b8bit\b/gi,
  ]
  for (const pat of noisePats) {
    outside = outside.replace(pat, ' ')
  }

  // 逐token清漏网噪声
  const outsideParts = outside.split(/\s+/).filter(t => {
    const tk = t.trim()
    if (!tk) return false
    if (/^\d+[pPkK]$/.test(tk)) return false
    if (/^\d{3,4}[xX×]\d{3,4}$/.test(tk)) return false
    if (/^\d+$/.test(tk)) return false
    if (/^[A-Za-z0-9\-+_\.]{2,10}$/.test(tk) && NOISE.has(tk)) return false
    return true
  })

  const parts = [...titleFromBrackets, outsideParts.join(' ')]
  let result = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

  if (!result) {
    result = folderName.replace(/\[[^\]]*\]/g, ' ').replace(/[\(（][^)）]*[\)）]/g, ' ')
      .replace(/[_\.]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return result || folderName
}

/**
 * 简化版清洗：仅用于短名显示，更激进地去噪声
 */
export function cleanDisplayName(folderName: string): string {
  // 先尝试提取「标题」方括号
  const brackets: string[] = []
  folderName.replace(/\[([^\]]+)\]/g, (_, c) => { brackets.push(c); return '' })
  const title = brackets.find(b => !looksLikeNoise(b))
  if (title) return title

  // 否则用完整清洗
  const cleaned = cleanSearchKeyword(folderName)
  // 如果清洗后没变，至少去掉方括号和常见后缀
  if (cleaned === folderName) {
    return folderName.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ')
      .replace(/[_\.]/g, ' ').replace(/\s+/g, ' ').trim() || folderName
  }
  return cleaned
}
