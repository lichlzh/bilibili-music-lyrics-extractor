import { contextBridge, ipcRenderer } from 'electron'
import type { ProgressPayload, Settings, SongItem, StoreData, UpdateState } from '../shared/types'

const api = {
  getStore: (): Promise<StoreData> => ipcRenderer.invoke('store:get'),
  setSongs: (songs: SongItem[]): Promise<void> => ipcRenderer.invoke('store:setSongs', songs),
  setSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke('store:setSettings', settings),
  selectOutputDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectOutputDir'),
  startAll: (songs: SongItem[], settings: Settings): Promise<void> =>
    ipcRenderer.invoke('download:startAll', songs, settings),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke('download:cancel', id),
  recalibrate: (item: SongItem): Promise<void> => ipcRenderer.invoke('lyrics:recalibrate', item),
  openLyrics: (p: string): Promise<string> => ipcRenderer.invoke('lyrics:open', p),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('app:checkForUpdates'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  openLogDir: (): Promise<string> => ipcRenderer.invoke('app:openLogDir'),
  onProgress: (cb: (payload: ProgressPayload) => void): (() => void) => {
    const listener = (_e: unknown, payload: ProgressPayload): void => cb(payload)
    ipcRenderer.on('download:progress', listener)
    return () => ipcRenderer.removeListener('download:progress', listener)
  },
  onUpdateStatus: (cb: (status: UpdateState) => void): (() => void) => {
    const listener = (_e: unknown, status: UpdateState): void => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api
