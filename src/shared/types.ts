export type SongType = '原唱' | '伴奏'

/** 歌词时间轴校准方式：off=不校准(沿用源或均分)，signal=本地信号对齐(A 方案)，whisperx=ML 强制对齐(B 方案，预留未实现) */
export type AlignMethod = 'off' | 'signal' | 'whisperx'

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
  /** 去时间标签后的纯文本行（用于后续校准） */
  plainText?: string
  /** 时间轴是否来自歌词源自带（true 时不再做本地校准） */
  sourceSynced?: boolean
  /** 音频时长（秒），供校准使用 */
  audioDur?: number
  /** 是否经过本地校准生成时间轴 */
  calibrated?: boolean
  /** 实际使用的校准方式 */
  alignMethod?: AlignMethod
  /** 校准阶段状态，用于 UI 展示 */
  calibrateStatus?: 'calibrating' | 'done' | 'failed' | 'skipped'
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
  /** 歌词时间轴校准方式，默认本地信号对齐(A 方案) */
  alignMethod: AlignMethod
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
