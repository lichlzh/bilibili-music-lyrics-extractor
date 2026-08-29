import type { ProgressPayload, Settings, SongItem, StoreData, UpdateState } from '../shared/types'

export interface AppApi {
  getStore: () => Promise<StoreData>
  setSongs: (songs: SongItem[]) => Promise<void>
  setSettings: (settings: Settings) => Promise<void>
  selectOutputDir: () => Promise<string | null>
  startAll: (songs: SongItem[], settings: Settings) => Promise<void>
  cancel: (id: string) => Promise<void>
  recalibrate: (item: SongItem) => Promise<void>
  openLyrics: (path: string) => Promise<string>
  checkForUpdates: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  openLogDir: () => Promise<string>
  onProgress: (cb: (payload: ProgressPayload) => void) => () => void
  onUpdateStatus: (cb: (status: UpdateState) => void) => () => void
}

declare global {
  interface Window {
    api: AppApi
  }
}

export {}
