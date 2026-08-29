import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { registerIpc } from './ipc'
import { initBinaries } from './binaries'
import { checkForUpdates } from './updater'
import { initLogger, logInfo } from './logger'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  void initBinaries()

  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    title: 'B站音乐下载器',
    backgroundColor: '#0B1120',
    webPreferences: {
      preload: ['index.cjs', 'index.js', 'index.mjs']
        .map((f) => join(__dirname, '../preload', f))
        .find(existsSync)!,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpc(mainWindow)

  // 启动后静默检查更新（仅发现新版本时提示，网络不可达则忽略）
  void checkForUpdates(true)
}

app.whenReady().then(() => {
  initLogger()
  logInfo('app', `启动 v${app.getVersion()} (${process.platform} ${process.arch})`)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
