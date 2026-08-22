import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { getFfmpegPath, getYtDlpPath, sanitizeName } from './binaries'
import { fetchAndSaveLyrics } from './lyrics'
import type {
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

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, Math.min(4, n || 2))
  }

  startAll(items: SongItem[], settings: Settings): void {
    this.outputDir = settings.outputDir
    this.concurrency = settings.concurrency
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

  /** MP3 下载完成后，自动检索并保存同名 .lrc，并回传对应校验结果。 */
  private async attachLyrics(item: SongItem, mp3Path: string): Promise<void> {
    try {
      const lyrics = await fetchAndSaveLyrics(item.name, item.type, mp3Path, item.url)
      const tail =
        lyrics.status === 'downloaded'
          ? ' · 歌词已下载'
          : lyrics.status === 'mismatch'
            ? ' · 歌词可能不符'
            : ' · 未找到歌词'
      this.emit(item.id, 100, 'done', `已保存为 MP3${tail}`, mp3Path, lyrics)
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
