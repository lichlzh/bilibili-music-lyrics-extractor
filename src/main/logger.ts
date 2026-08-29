import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

/** 单文件日志上限；超过则保留尾部内容做一次简单轮转，避免无限增长。 */
const MAX_BYTES = 512 * 1024
const KEEP_BYTES = 256 * 1024

let logFile = ''
let dirReady: Promise<unknown> = Promise.resolve()

/** 应用启动期调用：确定日志文件位置并创建目录。 */
export function initLogger(): void {
  logFile = path.join(app.getPath('userData'), 'logs', 'app.log')
  dirReady = fsp.mkdir(path.dirname(logFile), { recursive: true }).catch(() => undefined)
}

export function getLogDir(): string {
  return logFile ? path.dirname(logFile) : ''
}

async function write(level: string, tag: string, msg: string): Promise<void> {
  if (!logFile) return
  const line = `[${new Date().toISOString()}] [${level}] [${tag}] ${msg}\n`
  if (level === 'ERROR') console.error(line.trimEnd())
  else console.log(line.trimEnd())
  try {
    await dirReady
    await fsp.appendFile(logFile, line)
    const st = await fsp.stat(logFile).catch(() => null)
    if (st && st.size > MAX_BYTES) {
      const buf = await fsp.readFile(logFile, 'utf8')
      await fsp.writeFile(logFile, buf.slice(-KEEP_BYTES))
    }
  } catch {
    /* 日志写入失败绝不影响主流程 */
  }
}

export function logInfo(tag: string, msg: string): void {
  void write('INFO', tag, msg)
}

export function logError(tag: string, msg: string): void {
  void write('ERROR', tag, msg)
}
