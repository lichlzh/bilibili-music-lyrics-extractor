import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { DownloadManager } from './downloadManager'
import { loadStore, saveSettings, saveSongs } from './store'
import { checkForUpdates, setUpdaterWindow } from './updater'
import { getLogDir } from './logger'
import type { Settings, SongItem } from '../shared/types'

export const manager = new DownloadManager()

/** 允许通过系统浏览器打开的域名白名单（渲染层不可指定任意 URL）。 */
const EXTERNAL_HOSTS = new Set(['github.com', 'api.github.com'])

export function registerIpc(win: BrowserWindow): void {
  manager.setWindow(win)
  setUpdaterWindow(win)

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
  ipcMain.handle('app:checkForUpdates', () => checkForUpdates())
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (parsed.protocol !== 'https:' || !EXTERNAL_HOSTS.has(parsed.hostname)) return
    return shell.openExternal(parsed.toString())
  })
  ipcMain.handle('app:openLogDir', () => {
    const dir = getLogDir()
    return dir ? shell.openPath(dir) : ''
  })
}
