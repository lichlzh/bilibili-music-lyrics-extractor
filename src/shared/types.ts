export type SongType = '原唱' | '伴奏'

export type DownloadStatus =
  | 'waiting'
  | 'downloading'
  | 'converting'
  | 'done'
  | 'error'
  | 'canceled'

export type LyricsStatus = 'downloaded' | 'mismatch' | 'notfound'

export interface LyricsInfo {
  status: LyricsStatus
  path?: string
  note?: string
  synced?: boolean
}

export interface SongItem {
  id: string
  name: string
  type: SongType
  url: string
  status: DownloadStatus
  percent: number
  message?: string
  outputPath?: string
  lyrics?: LyricsInfo
}

export interface Settings {
  outputDir: string
  concurrency: number
}

export interface ProgressPayload {
  id: string
  percent: number
  status: DownloadStatus
  message?: string
  outputPath?: string
  lyrics?: LyricsInfo
}

export interface StoreData {
  songs: SongItem[]
  settings: Settings
}

export const STATUS_LABEL: Record<DownloadStatus, string> = {
  waiting: '等待中',
  downloading: '下载中',
  converting: '转码中',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}
