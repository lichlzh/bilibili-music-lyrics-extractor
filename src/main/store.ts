import Store from 'electron-store'
import os from 'node:os'
import path from 'node:path'
import type { Settings, SongItem, StoreData } from '../shared/types'

const store = new Store<StoreData>({ name: 'bilibili-mp3' })

const defaultSettings: Settings = {
  outputDir: path.join(os.homedir(), 'Downloads', 'songs'),
  concurrency: 2,
  alignMethod: 'signal'
}

/**
 * 归一化歌曲状态：下载中/转码中属于瞬时状态，落盘与载入时统一回退为等待中。
 * 否则应用中途退出后，这些任务会永久卡在「下载中」——既不会被重跑也无法重置。
 */
function normalizeSongs(songs: SongItem[]): SongItem[] {
  return songs.map((s) =>
    s.status === 'downloading' || s.status === 'converting'
      ? { ...s, status: 'waiting' as const, percent: 0 }
      : s
  )
}

export function loadStore(): StoreData {
  return {
    songs: normalizeSongs((store.get('songs') as SongItem[]) ?? []),
    settings: { ...defaultSettings, ...(store.get('settings') as Settings) }
  }
}

export function saveSongs(songs: SongItem[]): void {
  store.set('songs', normalizeSongs(songs))
}

export function saveSettings(settings: Settings): void {
  store.set('settings', settings)
}
