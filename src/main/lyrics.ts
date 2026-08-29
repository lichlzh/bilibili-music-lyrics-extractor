import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import iconv from 'iconv-lite'
import { getFfprobePath, getYtDlpPath, getFfmpegPath } from './binaries'
import { fetchWithTimeout } from './http'
import { logInfo } from './logger'
import type { AlignMethod, LyricsInfo, SongType } from '../shared/types'

const LRCLIB = 'https://lrclib.net/api'

/** 仅保留字母与数字（含中日韩），去除空格与标点，便于相似度比较。 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

/** Dice 系数：基于二元组的相似度，取值 0~1，适合短字符串（含中文）。 */
function dice(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return (2 * inter) / (A.size + B.size)
}

/** 去除“伴奏 / instrumental”等字样，让歌词检索命中原曲。 */
function cleanQuery(name: string): string {
  return name
    .replace(/[（(]?\s*伴奏\s*[)）]?/g, '')
    .replace(/\binstrumental\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface LrcCandidate {
  id: number | string
  trackName: string
  artistName: string
  albumName?: string
  duration?: number
  plainLyrics?: string
  syncedLyrics?: string | null
}

function runAndGet(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', () => {})
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`))))
    child.on('error', reject)
  })
}

/** 采集命令的 stderr（ffmpeg 把元信息写在 stderr），忽略退出码。 */
function runAndGetStderr(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let out = ''
    child.stdout.on('data', () => {})
    child.stderr.on('data', (d) => (out += d.toString()))
    child.on('close', () => resolve(out))
    child.on('error', reject)
  })
}

/**
 * 用随应用分发的 ffmpeg 解析音频时长（读容器头，几乎零成本）。
 * 避免客户机未安装 ffprobe 时，为取时长对每首歌都发一次网络请求。
 */
async function ffmpegDuration(mp3Path: string): Promise<number | null> {
  const bin = getFfmpegPath() || 'ffmpeg'
  const out = await runAndGetStderr(bin, ['-i', mp3Path])
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
  return Number.isFinite(n) && n > 0 ? n : null
}

async function searchNetease(query: string): Promise<LrcCandidate[]> {
  const headers = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com' }
  const enc = encodeURIComponent(query)
  try {
    const res = await fetchWithTimeout(
      `https://music.163.com/api/search/get/?s=${enc}&type=1&limit=5`,
      { headers },
      6000
    )
    if (!res.ok) return []
    const data = (await res.json()) as { result?: { songs?: NeteaseSong[] } }
    const songs = data.result?.songs ?? []
    const cands: LrcCandidate[] = []
    for (const s of songs.slice(0, 5)) {
      try {
        const lr = await fetchWithTimeout(
          `https://music.163.com/api/song/lyric?id=${s.id}&lv=1&kv=1&tv=-1`,
          { headers },
          6000
        )
        if (!lr.ok) continue
        const lj = (await lr.json()) as { lrc?: { lyric?: string }; code?: number }
        if (lj.code && lj.code < 0) continue
        const synced = (lj.lrc?.lyric || '').trim()
        if (!synced) continue
        cands.push({
          id: `ne-${s.id}`,
          trackName: s.name || '',
          artistName: (s.artists || []).map((a) => a.name).join('/'),
          duration: s.duration ? s.duration / 1000 : undefined,
          syncedLyrics: synced,
          plainLyrics: synced
        })
      } catch {
        /* 忽略单条失败 */
      }
    }
    return cands
  } catch (e) {
    logInfo('lyrics', `网易云检索失败：${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

interface NeteaseSong {
  id: number
  name: string
  duration?: number
  artists?: { name: string }[]
}

/** 读取音频真实时长（秒）：优先 ffprobe，否则回退 yt-dlp 元数据。 */
export async function getAudioDuration(mp3Path: string, url: string): Promise<number | null> {
  const ffprobe = await getFfprobePath()
  if (ffprobe) {
    try {
      const out = await runAndGet(ffprobe, [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=nk=1:nw=1', mp3Path
      ])
      const n = parseFloat(out)
      if (!Number.isNaN(n) && n > 0) return n
    } catch {
      /* 忽略，尝试回退 */
    }
  }
  // 其次用内置的 ffmpeg 读容器头取时长，避免为取时长发网络请求
  try {
    const n = await ffmpegDuration(mp3Path)
    if (n != null) return n
  } catch (e) {
    logInfo('lyrics', `ffmpeg 解析时长失败：${e instanceof Error ? e.message : String(e)}`)
  }
  // 最后才回退到联网查询元数据
  try {
    const yt = await getYtDlpPath()
    const out = await runAndGet(yt, ['--skip-download', '--print', '%(duration)s', url])
    const n = parseFloat(out)
    if (!Number.isNaN(n) && n > 0) return n
  } catch {
    /* 忽略 */
  }
  return null
}

/** 取同步歌词中最大的时间戳（秒），用于与音频时长比对。 */
function lrcSpan(synced: string): number {
  let max = 0
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(synced))) {
    const t = parseInt(m[1], 10) * 60 + parseFloat(m[2])
    if (t > max) max = t
  }
  return max
}

async function searchLrclib(query: string): Promise<LrcCandidate[]> {
  const headers = {
    'User-Agent': 'bili-mp3-downloader/1.0',
    Accept: 'application/json'
  }
  const doSearch = async (url: string): Promise<LrcCandidate[]> => {
    try {
      const res = await fetchWithTimeout(url, { headers }, 6000)
      if (!res.ok) return []
      const data = (await res.json()) as LrcCandidate[]
      return Array.isArray(data) ? data : []
    } catch (e) {
      logInfo('lyrics', `lrclib 检索失败：${e instanceof Error ? e.message : String(e)}`)
      return []
    }
  }
  const enc = (s: string) => encodeURIComponent(s)
  const results: LrcCandidate[] = []
  // 1) 完整查询兜底
  results.push(...(await doSearch(`${LRCLIB}/search?q=${enc(query)}`)))
  // 2) 若含 “艺人 - 曲名”，优先用曲名检索（召回更高），再加精确匹配
  const parts = query.split(' - ')
  if (parts.length >= 2) {
    const artist = parts[0].trim()
    const track = parts.slice(1).join(' - ').trim()
    results.push(...(await doSearch(`${LRCLIB}/search?q=${enc(track)}`)))
    results.push(...(await doSearch(`${LRCLIB}/search?track=${enc(track)}&artist=${enc(artist)}`)))
  }
  const seen = new Set<number | string>()
  return results.filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
}

function lrcTimestamp(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const cs = Math.round((sec - Math.floor(sec)) * 100)
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
}

/** 去掉每行已有时间标签，得到纯文本行。 */
function stripTimestamps(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\[\d+:\d+(?:\.\d+)?\]\s*/, '').trim())
    .filter(Boolean)
}

/**
 * 当歌词源只提供纯文本、但音箱需要可滚动的带时间轴 LRC 时，
 * 按音频时长把每行均匀铺开，合成近似时间轴（内容仍为正确歌词）。
 */
function synthesizeSynced(plain: string, totalDur: number): string {
  const lines = stripTimestamps(plain)
  if (lines.length === 0) return plain.trim()
  const per = totalDur / lines.length
  let t = 0
  return lines
    .map((l) => {
      const tag = lrcTimestamp(t)
      t += per
      return `${tag} ${l}`
    })
    .join('\n')
}

/** 以 GBK 写出 .lrc（兼容 GC200 Pro 等按 GBK 解读的硬件）。 */
export async function saveLyricsFile(lrcPath: string, text: string): Promise<void> {
  await fsp.writeFile(lrcPath, iconv.encode(text + '\n', 'gbk'))
}

/**
 * 歌词对齐器接口：给定纯文本行与音频，返回带时间轴的 LRC 文本。
 * 目前仅有本地信号对齐(A 方案)实现，在 getAligner 中注册。
 */
export interface LyricAligner {
  method: AlignMethod
  align(plain: string, mp3Path: string, audioDur: number, ffmpeg: string | null): Promise<string>
}

const PCM_SR = 22050
const HOP_SEC = 0.05
const HOP = Math.floor(PCM_SR * HOP_SEC)

/** 用 ffmpeg 提取人声频段(200–3000Hz)的原始 PCM，返回 Int16 采样数组。 */
async function extractPcm(mp3Path: string, ffmpeg: string | null): Promise<Int16Array> {
  const bin = ffmpeg || 'ffmpeg'
  const args = [
    '-i', mp3Path,
    '-vn', '-ac', '1', '-ar', String(PCM_SR),
    '-af', 'highpass=f=200,lowpass=f=3000',
    '-f', 's16le', '-'
  ]
  const out = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    const chunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', () => {})
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exit ${code}`))))
    child.on('error', reject)
  })
  if (out.length < HOP * 2) throw new Error('音频提取为空')
  const n = Math.floor(out.length / 2)
  const samples = new Int16Array(n)
  for (let i = 0; i < n; i++) samples[i] = out.readInt16LE(i * 2)
  return samples
}

/** 基于能量起音把每行歌词对齐到演唱时刻（A 方案：本地信号对齐）。 */
class SignalAligner implements LyricAligner {
  method: AlignMethod = 'signal'

  async align(plain: string, mp3Path: string, audioDur: number, ffmpeg: string | null): Promise<string> {
    const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return plain.trim()

    const samples = await extractPcm(mp3Path, ffmpeg)
    const derivedDur = samples.length / PCM_SR
    const dur = audioDur > 0 ? audioDur : derivedDur
    const frames: number[] = []
    for (let i = 0; i < samples.length; i += HOP) {
      const end = Math.min(i + HOP, samples.length)
      let sum = 0
      for (let j = i; j < end; j++) {
        const v = samples[j] / 32768
        sum += v * v
      }
      frames.push(Math.sqrt(sum / (end - i)))
    }
    const maxE = Math.max(...frames) || 1
    const norm = frames.map((e) => e / maxE)
    const thr = 0.22
    // 人声活跃段
    const segs: { start: number; end: number }[] = []
    let i = 0
    while (i < norm.length) {
      if (norm[i] > thr) {
        let j = i
        while (j < norm.length && norm[j] > thr) j++
        const start = i * HOP_SEC
        const end = j * HOP_SEC
        if (end - start >= 0.3) segs.push({ start, end })
        i = j
      } else i++
    }
    const times = assignTimes(lines.length, segs, dur)
    return lines.map((l, idx) => `${lrcTimestamp(times[idx] ?? dur)} ${l}`).join('\n')
  }
}

/** 把 N 行按人声段分布到时间序列，保证单调递增且在 [0, audioDur] 内。 */
function assignTimes(n: number, segs: { start: number; end: number }[], audioDur: number): number[] {
  // 起音锚点：每段起点，长段(>6s)再加一个中点
  const anchors: number[] = []
  for (const s of segs) {
    anchors.push(s.start)
    if (s.end - s.start > 6) anchors.push((s.start + s.end) / 2)
  }
  anchors.sort((a, b) => a - b)

  if (anchors.length === 0) {
    // 未检测到人声：退化为整段均分
    return Array.from({ length: n }, (_, i) => (audioDur * (i + 0.5)) / n)
  }
  if (anchors.length >= n) {
    const times: number[] = []
    for (let i = 0; i < n; i++) {
      const idx = n === 1 ? 0 : Math.round((i * (anchors.length - 1)) / (n - 1))
      times.push(anchors[idx])
    }
    for (let i = 1; i < n; i++) if (times[i] <= times[i - 1]) times[i] = times[i - 1] + 0.1
    return times
  }
  // 锚点少于行数：按段时长把行分配到各段内线性铺开
  const segs2 = segs.length ? segs : [{ start: 0, end: audioDur }]
  const totalLen = segs2.reduce((a, s) => a + (s.end - s.start), 0) || audioDur
  const counts = segs2.map((s) => Math.max(1, Math.round((n * (s.end - s.start)) / totalLen)))
  let diff = n - counts.reduce((a, b) => a + b, 0)
  let k = 0
  while (diff !== 0) {
    counts[k % counts.length] += Math.sign(diff)
    diff -= Math.sign(diff)
    k++
  }
  const times: number[] = []
  segs2.forEach((s, si) => {
    const c = counts[si]
    for (let li = 0; li < c; li++) {
      const t = c === 1 ? s.start : s.start + ((s.end - s.start) * (li + 0.5)) / c
      times.push(t)
    }
  })
  times.sort((a, b) => a - b)
  return times
}

/** 根据校准方式返回对应对齐器；目前仅本地信号对齐(A 方案)可用。 */
export function getAligner(method: AlignMethod): LyricAligner | null {
  return method === 'signal' ? new SignalAligner() : null
}

/**
 * 纯文本歌词 + 音频 → 校准后的带时间轴 LRC 文本。
 * 失败(如 ffmpeg 不可用)时抛错，由调用方回退到均分时间轴。
 */
export async function calibrateLyrics(
  plain: string,
  mp3Path: string,
  audioDur: number,
  method: AlignMethod,
  ffmpeg: string | null
): Promise<string> {
  const aligner = getAligner(method)
  if (!aligner) throw new Error(`校准方式未实现: ${method}`)
  return aligner.align(plain, mp3Path, audioDur, ffmpeg)
}

/** 曲名相似度达标门槛：低于此值视为“检索返回的是别的歌”，绝不采用。 */
const NAME_MIN = 0.5

function nameScoreOf(c: LrcCandidate, queryNorm: string): number {
  const sTrack = normalize(c.trackName)
  const sBoth = normalize(`${c.trackName} ${c.artistName}`)
  return Math.max(dice(queryNorm, sTrack), dice(queryNorm, sBoth))
}

type Scored = LrcCandidate & { _score: number; _nameScore: number }

function scoreCandidate(c: LrcCandidate, queryNorm: string, audioDur: number | null): Scored {
  const nameScore = nameScoreOf(c, queryNorm)
  let score = nameScore
  if (audioDur != null && typeof c.duration === 'number') {
    const diff = Math.abs(audioDur - c.duration)
    const durScore = diff <= 8 ? 1 : diff <= 20 ? 0.6 : 0.2
    score = nameScore * 0.75 + durScore * 0.25
  }
  return { ...c, _score: score, _nameScore: nameScore }
}

function pickBest(cands: LrcCandidate[], queryNorm: string, audioDur: number | null): Scored {
  const scored = cands.map((c) => scoreCandidate(c, queryNorm, audioDur))
  const eligible = scored.filter((c) => c._nameScore >= NAME_MIN)
  // 仅在“曲名匹配”的候选里优先选带时间轴者；错误歌曲已被排除
  const pool = eligible.length ? eligible : scored
  const synced = pool.filter((c) => c.syncedLyrics)
  const finalPool = synced.length ? synced : pool
  let best = finalPool[0]
  for (const c of finalPool) if (c._score > best._score) best = c
  return best
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 为已下载的 MP3 检索并保存同名 .lrc，并校验歌词与歌曲是否对应。
 * 对应校验 = 曲名/歌手相似度 + 音频时长一致性；只有曲名相似度达标才采用，
 * 避免把检索返回的“错误歌曲”的歌词写入文件。
 * 若只有纯文本歌词而音箱需要时间轴，则按音频时长合成近似时间轴。
 */
export async function fetchAndSaveLyrics(
  name: string,
  _type: SongType,
  mp3Path: string,
  url: string
): Promise<LyricsInfo> {
  const query = cleanQuery(name) || name
  const queryNorm = normalize(query)
  const lrclib = await searchLrclib(query)
  const cands: LrcCandidate[] = [...lrclib]
  // 网易云做最佳补充（中文覆盖好且带时间轴）；当前可能被风控，失败则静默跳过
  const ne = await searchNetease(query)
  cands.push(...ne)

  if (cands.length === 0) {
    return { status: 'notfound', note: '未在歌词库找到匹配' }
  }

  const audioDur = await getAudioDuration(mp3Path, url)
  const best = pickBest(cands, queryNorm, audioDur)

  // 没有任何候选通过曲名匹配 → 极可能是错误歌曲，绝不写入文件
  if (best._nameScore < NAME_MIN) {
    return {
      status: 'mismatch',
      note: `未找到曲名匹配的歌词(最高相似度 ${Math.round(best._nameScore * 100)}%)`
    }
  }

  const hasSyncedSource = !!best.syncedLyrics
  const rawText = (best.syncedLyrics || best.plainLyrics || '').trim()
  let text = rawText
  let synced = hasSyncedSource
  // 去时间标签后的纯文本行，留给后续的本地校准阶段使用
  const plainText = stripTimestamps(rawText).join('\n')

  // 仅有纯文本、但音频时长可用 → 先合成近似时间轴，便于音箱滚动显示（校准阶段会覆盖）
  if (!hasSyncedSource && audioDur != null && audioDur > 0) {
    text = synthesizeSynced(text, audioDur)
    synced = true
  }

  if (!text) {
    return { status: 'notfound', note: '歌词库无可用文本' }
  }

  const dir = path.dirname(mp3Path)
  const base = path.basename(mp3Path, '.mp3')
  const lrcPath = path.join(dir, `${base}.lrc`)
  // GC200 Pro 等嵌入式/云音箱硬件按 GBK 解读 .lrc 字节，UTF-8 会乱码，故以 GBK 写出
  await saveLyricsFile(lrcPath, text)

  const span = synced ? lrcSpan(text) : best.duration ?? 0

  let durOk = true
  const notes: string[] = [`匹配度 ${Math.round(best._nameScore * 100)}%`]

  if (audioDur != null) {
    if (span > audioDur + 12) {
      durOk = false
      notes.push(`歌词时长(${fmtTime(span)})超出音频(${fmtTime(audioDur)})`)
    } else {
      notes.push('时长一致')
    }
  } else {
    notes.push('时长未校验')
  }

  if (hasSyncedSource) notes.push('带时间轴')
  else if (synced) notes.push('近似时间轴(按音频时长均分)')
  else notes.push('纯文本(无时间轴)')

  const nameOk = best._nameScore >= 0.45
  const status: LyricsInfo['status'] = !nameOk || !durOk ? 'mismatch' : 'downloaded'

  return {
    status,
    path: lrcPath,
    note: notes.join(' · '),
    synced,
    plainText,
    sourceSynced: hasSyncedSource,
    audioDur: audioDur ?? undefined
  }
}
