import * as ytDlpWrapNs from 'yt-dlp-wrap'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { app } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { logInfo } from './logger'

// yt-dlp-wrap 在不同打包形态下导出位置不同，做一次兼容解析
const YtDlpWrap: any =
  (ytDlpWrapNs as any).default?.default ??
  (ytDlpWrapNs as any).default ??
  (ytDlpWrapNs as any).YtDlpWrap ??
  ytDlpWrapNs

let ytDlpPathCache: string | null = null
let ffmpegPathCache: string | null = null
let systemFfmpeg = false

function sanitize(raw: string): string {
  return raw.replace(/[\\/:*?"<>|]/g, '_').trim()
}

/** 试跑 `name --version`，存在且在 PATH 中则返回命令名本身。 */
function resolveSystem(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(name, ['--version'], { windowsHide: true })
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 ? name : null))
  })
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

/** 应用启动期调用：探测系统是否已有 ffmpeg，供后续选择二进制。 */
export async function initBinaries(): Promise<void> {
  systemFfmpeg = (await resolveSystem('ffmpeg')) !== null
}

/** 定位随应用分发的 yt-dlp（构建期已下载进 resources/bin/），不存在则返回 null。 */
async function resolveBundledYtDlp(): Promise<string | null> {
  const bundledName =
    process.platform === 'win32' ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp-macos' : 'yt-dlp-linux'
  const bundled = path.join(process.resourcesPath, 'bin', bundledName)
  if (!(await exists(bundled))) return null
  if (process.platform !== 'win32') {
    try {
      await fsp.chmod(bundled, 0o755)
    } catch {
      /* 忽略：权限已正确时无需处理 */
    }
  }
  return bundled
}

/**
 * 解析 yt-dlp 可执行文件路径。
 * 打包后优先使用内置副本：既避免运行时访问 GitHub，也避免误用客户机 PATH 里
 * 旧版/损坏的 yt-dlp；内置缺失才回退系统 PATH，最后才是运行时下载。
 */
export async function getYtDlpPath(): Promise<string> {
  if (ytDlpPathCache) return ytDlpPathCache

  if (app.isPackaged) {
    const bundled = await resolveBundledYtDlp()
    if (bundled) {
      logInfo('binaries', `使用内置 yt-dlp: ${bundled}`)
      ytDlpPathCache = bundled
      return bundled
    }
  }

  const system = await resolveSystem('yt-dlp')
  if (system) {
    logInfo('binaries', `使用系统 yt-dlp (PATH): ${system}`)
    ytDlpPathCache = system
    return system
  }

  logInfo('binaries', '未找到内置/系统 yt-dlp，将尝试运行时从 GitHub 下载')

  const dir = path.join(app.getPath('userData'), 'bin')
  await fsp.mkdir(dir, { recursive: true })
  const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const target = path.join(dir, exe)
  if (!(await exists(target))) {
    await YtDlpWrap.downloadFromGithub(target)
  }
  ytDlpPathCache = target
  return target
}

/** 返回 ffmpeg 路径；若系统已安装则返回 null（交由 yt-dlp 自行从 PATH 查找）。 */
export function getFfmpegPath(): string | null {
  if (systemFfmpeg) return null
  if (ffmpegPathCache) return ffmpegPathCache
  const bundled = app.isPackaged
    ? ffmpegInstaller.path.replace('app.asar', 'app.asar.unpacked')
    : ffmpegInstaller.path
  ffmpegPathCache = bundled
  return bundled
}

export function sanitizeName(name: string): string {
  return sanitize(name)
}

let ffprobeCache: string | null | undefined

/** 返回系统 ffprobe 命令（用于读取音频时长）；若未安装则返回 null。 */
export async function getFfprobePath(): Promise<string | null> {
  if (ffprobeCache !== undefined) return ffprobeCache
  ffprobeCache = await resolveSystem('ffprobe')
  return ffprobeCache
}
