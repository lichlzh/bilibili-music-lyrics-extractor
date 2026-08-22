import Store from 'electron-store'
import os from 'node:os'
import path from 'node:path'
import type { Settings, SongItem, StoreData } from '../shared/types'

const store = new Store<StoreData>({ name: 'bilibili-mp3' })

const defaultSettings: Settings = {
  outputDir: path.join(os.homedir(), 'Downloads', 'songs'),
  concurrency: 2
}

export function loadStore(): StoreData {
  return {
    songs: (store.get('songs') as SongItem[]) ?? [],
    settings: (store.get('settings') as Settings) ?? defaultSettings
  }
}

export function saveSongs(songs: SongItem[]): void {
  store.set('songs', songs)
}

export function saveSettings(settings: Settings): void {
  store.set('settings', settings)
}
