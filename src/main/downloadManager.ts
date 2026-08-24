import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { getFfmpegPath, getYtDlpPath, sanitizeName } from './binaries'
import { fetchAndSaveLyrics, calibrateLyrics, saveLyricsFile, getAudioDuration } from './lyrics'
import type {
  AlignMethod,
  DownloadStatus,
  LyricsInfo,
  ProgressPayload,
  Settings,
  SongItem
} from '../shared/types'

export class DownloadManager {
  private win: BrowserWindow | null = null
  private running = 0
  private concurrency = 2
  private queue: SongItem[] = []
  private active = new Map<string, ChildProcess>()
  private outputDir = ''
  private settings: Settings = { outputDir: '', concurrency: 2, alignMethod: 'signal' }

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, Math.min(4, n || 2))
  }

  setSettings(s: Settings): void {
    this.settings = s
  }

  startAll(items: SongItem[], settings: Settings): void {
    this.outputDir = settings.outputDir
    this.concurrency = settings.concurrency
    this.settings = settings
    this.queue = items.filter(
      (i) => i.status !== 'done' && i.status !== 'downloading' && i.status !== 'converting'
    )
    this.queue.forEach((i) => this.emit(i.id, 0, 'waiting'))
    this.pump()
  }

  cancel(id: string): void {
    const child = this.active.get(id)
    if (child) {
      child.kill('SIGTERM')
      this.active.delete(id)
      this.running = Math.max(0, this.running - 1)
    }
    this.queue = this.queue.filter((i) => i.id !== id)
    this.emit(id, 0, 'canceled')
    this.pump()
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!
      void this.run(item)
    }
  }

  private async run(item: SongItem): Promise<void> {
    this.running++
    this.emit(item.id, 0, 'downloading')
    try {
      const ytDlp = await getYtDlpPath()
      const ffmpeg = getFfmpegPath()
      const baseName = sanitizeName(`${item.name || item.url}-${item.type}`)
      const outTemplate = path.join(this.outputDir, `${baseName}.%(ext)s`)
      const args = [
        '-f', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '2',
        '--no-playlist',
        '--newline',
        '--ignore-errors',
        '-o', outTemplate,
        item.url
      ]
      if (ffmpeg) args.splice(5, 0, '--ffmpeg-location', ffmpeg)

      const child = spawn(ytDlp, args)
      this.active.set(item.id, child)

      const onData = (chunk: Buffer): void => {
        const text = chunk.toString()
        const m = text.match(/(\d+(?:\.\d+)?)%/)
        if (m) this.emit(item.id, parseFloat(m[1]), 'downloading')
        if (/ExtractAudio|ffmpeg/i.test(text)) this.emit(item.id, 100, 'converting')
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)

      child.on('close', (code) => {
        this.running--
        this.active.delete(item.id)
        const finalPath = outTemplate.replace('%(ext)s', 'mp3')
        if (code === 0) {
          this.emit(item.id, 100, 'done', '已保存为 MP3', finalPath)
          void this.attachLyrics(item, finalPath)
        } else {
          this.emit(item.id, 0, 'error', `yt-dlp 退出码 ${code}`)
        }
        this.pump()
      })
      child.on('error', (err) => {
        this.running--
        this.active.delete(item.id)
        this.emit(item.id, 0, 'error', err.message)
        this.pump()
      })
    } catch (e) {
      this.running--
      this.emit(item.id, 0, 'error', e instanceof Error ? e.message : String(e))
      this.pump()
    }
  }

  /** MP3 下载完成后，先检索歌词(阶段1)，再按需做本地时间轴校准(阶段2)，分别回传状态。 */
  private async attachLyrics(item: SongItem, mp3Path: string): Promise<void> {
    try {
      const lyrics = await fetchAndSaveLyrics(item.name, item.type, mp3Path, item.url)
      this.emitLyrics(item.id, mp3Path, lyrics)
      await this.calibrateAndEmit(item.id, mp3Path, lyrics)
    } catch (e) {
      this.emit(
        item.id,
        100,
        'done',
        '已保存为 MP3 · 歌词获取失败',
        mp3Path,
        { status: 'notfound', note: e instanceof Error ? e.message : String(e) }
      )
    }
  }

  /**
   * 对已有歌词做本地时间轴校准，并向渲染端回传进度。
   * 即使歌词源已带时间轴也仍校准：歌词与 mp3 往往来自不同来源，时间轴可能错位。
   */
  private async calibrateAndEmit(id: string, mp3Path: string, base: LyricsInfo): Promise<void> {
    const method = this.settings.alignMethod ?? 'off'
    if (method === 'off' || !base.plainText || !base.path) return
    this.emitLyrics(id, mp3Path, { ...base, alignMethod: method, calibrateStatus: 'calibrating' })
    try {
      const aligned = await calibrateLyrics(
        base.plainText,
        mp3Path,
        base.audioDur!,
        method,
        getFfmpegPath()
      )
      await saveLyricsFile(base.path, aligned)
      const label = method === 'signal' ? '信号对齐' : '未校准'
      const note = `${base.note ? base.note + ' · ' : ''}已校准(${label})`
      this.emitLyrics(id, mp3Path, {
        ...base,
        synced: true,
        calibrated: true,
        alignMethod: method,
        calibrateStatus: 'done',
        note
      })
    } catch (e) {
      const note = `${base.note ? base.note + ' · ' : ''}校准失败，保留原时间轴`
      this.emitLyrics(id, mp3Path, { ...base, calibrateStatus: 'failed', note })
    }
  }

  /** 对已完成下载的歌曲重新做时间轴校准（UI 触发），使用当前设置的对齐方式。 */
  async recalibrateSong(item: SongItem): Promise<void> {
    const ly = item.lyrics
    const mp3Path = item.outputPath
    if (!ly || !mp3Path) return
    if (this.settings.alignMethod === 'off') {
      this.emitLyrics(item.id, mp3Path, {
        ...ly,
        calibrateStatus: 'failed',
        note: `${ly.note ? ly.note + ' · ' : ''}未开启校准方式`
      })
      return
    }
    if (!ly.path || !ly.plainText) {
      this.emitLyrics(item.id, mp3Path, {
        ...ly,
        calibrateStatus: 'failed',
        note: `${ly.note ? ly.note + ' · ' : ''}无可校准歌词`
      })
      return
    }
    // 尽量取音频时长；取不到也无妨，信号对齐器会从音频自身推导总时长
    let audioDur = ly.audioDur ?? 0
    if (audioDur <= 0) {
      try {
        audioDur = (await getAudioDuration(mp3Path, item.url)) ?? 0
      } catch {
        audioDur = 0
      }
    }
    await this.calibrateAndEmit(item.id, mp3Path, { ...ly, audioDur })
  }

  private emitLyrics(id: string, mp3Path: string, lyrics: LyricsInfo): void {
    const tail =
      lyrics.status === 'downloaded'
        ? ' · 歌词已下载'
        : lyrics.status === 'mismatch'
          ? ' · 歌词可能不符'
          : ' · 未找到歌词'
    this.emit(id, 100, 'done', `已保存为 MP3${tail}`, mp3Path, lyrics)
  }

  private emit(
    id: string,
    percent: number,
    status: DownloadStatus,
    message = '',
    outputPath?: string,
    lyrics?: LyricsInfo
  ): void {
    const payload: ProgressPayload = { id, percent, status, message, outputPath, lyrics }
    this.win?.webContents.send('download:progress', payload)
  }
}
