import { contextBridge, ipcRenderer } from 'electron'
import type { ProgressPayload, Settings, SongItem, StoreData } from '../shared/types'

const api = {
  getStore: (): Promise<StoreData> => ipcRenderer.invoke('store:get'),
  setSongs: (songs: SongItem[]): Promise<void> => ipcRenderer.invoke('store:setSongs', songs),
  setSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke('store:setSettings', settings),
  selectOutputDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectOutputDir'),
  startAll: (songs: SongItem[], settings: Settings): Promise<void> =>
    ipcRenderer.invoke('download:startAll', songs, settings),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke('download:cancel', id),
  openLyrics: (p: string): Promise<string> => ipcRenderer.invoke('lyrics:open', p),
  onProgress: (cb: (payload: ProgressPayload) => void): (() => void) => {
    const listener = (_e: unknown, payload: ProgressPayload): void => cb(payload)
    ipcRenderer.on('download:progress', listener)
    return () => ipcRenderer.removeListener('download:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api
