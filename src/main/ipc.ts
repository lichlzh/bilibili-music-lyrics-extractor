import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { DownloadManager } from './downloadManager'
import { loadStore, saveSettings, saveSongs } from './store'
import type { Settings, SongItem } from '../shared/types'

export const manager = new DownloadManager()

export function registerIpc(win: BrowserWindow): void {
  manager.setWindow(win)

  ipcMain.handle('store:get', () => {
    const data = loadStore()
    manager.setSettings(data.settings)
    return data
  })
  ipcMain.handle('store:setSongs', (_e, songs: SongItem[]) => saveSongs(songs))
  ipcMain.handle('store:setSettings', (_e, settings: Settings) => {
    manager.setSettings(settings)
    return saveSettings(settings)
  })

  ipcMain.handle('dialog:selectOutputDir', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('download:startAll', (_e, songs: SongItem[], settings: Settings) => {
    manager.startAll(songs, settings)
  })
  ipcMain.handle('download:cancel', (_e, id: string) => manager.cancel(id))
  ipcMain.handle('lyrics:recalibrate', (_e, item: SongItem) => manager.recalibrateSong(item))
  ipcMain.handle('lyrics:open', (_e, p: string) => shell.openPath(p))
}
