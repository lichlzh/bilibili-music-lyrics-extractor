import type { ProgressPayload, Settings, SongItem, StoreData } from '../shared/types'

export interface AppApi {
  getStore: () => Promise<StoreData>
  setSongs: (songs: SongItem[]) => Promise<void>
  setSettings: (settings: Settings) => Promise<void>
  selectOutputDir: () => Promise<string | null>
  startAll: (songs: SongItem[], settings: Settings) => Promise<void>
  cancel: (id: string) => Promise<void>
  openLyrics: (path: string) => Promise<string>
  onProgress: (cb: (payload: ProgressPayload) => void) => () => void
}

declare global {
  interface Window {
    api: AppApi
  }
}

export {}
