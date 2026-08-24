#!/usr/bin/env node
/**
 * 构建期拉取 yt-dlp 二进制到项目 resources/，随应用一起分发，
 * 避免客户机在运行时访问 GitHub（很多网络/地区无法直连 GitHub Releases）。
 *
 * 用法:
 *   node scripts/fetch-yt-dlp.cjs            # 按当前平台下载
 *   node scripts/fetch-yt-dlp.cjs --win     # 强制下载 Windows 版（交叉构建 Win 安装包时用）
 *   node scripts/fetch-yt-dlp.cjs --mac     # 强制下载 macOS 版
 *   node scripts/fetch-yt-dlp.cjs --linux   # 强制下载 Linux 版
 * 也可用环境变量 YTDLP_PLATFORM=win32|darwin|linux 指定平台。
 *
 * 镜像源: 设置 YTDLP_MIRROR 可覆盖下载 base（如 https://ghproxy.net/https://github.com/...），
 *         用于构建机无法直接访问 GitHub 的场景。
 * 注意: 下载失败时仅告警并以退出码 0 结束（不阻断构建），此时应用回退为运行时从 GitHub 下载。
 */
const fs = require('node:fs')
const path = require('node:path')

const BASE = process.env.YTDLP_MIRROR || 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

function platformOf(arg) {
  if (arg === '--win' || process.env.YTDLP_PLATFORM === 'win32') return 'win32'
  if (arg === '--mac' || process.env.YTDLP_PLATFORM === 'darwin') return 'darwin'
  if (arg === '--linux' || process.env.YTDLP_PLATFORM === 'linux') return 'linux'
  return process.platform
}

const TARGETS = {
  win32: { file: 'yt-dlp.exe', url: `${BASE}/yt-dlp.exe` },
  darwin: { file: 'yt-dlp-macos', url: `${BASE}/yt-dlp_macos` },
  linux: { file: 'yt-dlp-linux', url: `${BASE}/yt-dlp` }
}

async function main() {
  const platform = platformOf(process.argv[2])
  const target = TARGETS[platform]
  if (!target) {
    console.error(`[fetch-yt-dlp] 不支持的平台: ${platform}`)
    process.exit(1)
  }

  const outDir = path.join(__dirname, '..', 'resources')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, target.file)

  console.log(`[fetch-yt-dlp] 下载 yt-dlp (${platform}) -> ${outFile}`)
  console.log(`[fetch-yt-dlp]   ${target.url}`)

  try {
    const res = await fetch(target.url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(outFile, buf)
    if (platform !== 'win32') {
      fs.chmodSync(outFile, 0o755) // 非 Windows 需要可执行权限
    }
    console.log(`[fetch-yt-dlp] 完成: ${outFile} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)
  } catch (e) {
    console.warn(`[fetch-yt-dlp] 警告: 下载失败 (${e.message})，应用将回退为运行时下载。`)
    console.warn(`[fetch-yt-dlp] 若构建机无法直连 GitHub，可设置 YTDLP_MIRROR 走镜像源后重试。`)
    process.exit(0) // 不阻断后续构建
  }
}

main().catch((e) => {
  console.error('[fetch-yt-dlp] 出错:', e)
  process.exit(1)
})
