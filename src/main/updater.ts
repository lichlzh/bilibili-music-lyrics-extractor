import { app, type BrowserWindow } from 'electron'

const REPO = 'lichlzh/bilibili-music-lyrics-extractor'
const RELEASES_PAGE = `https://github.com/${REPO}/releases`
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`

export type UpdateState =
  | { state: 'checking' }
  | { state: 'available'; version: string; url: string; notes?: string }
  | { state: 'latest'; version: string }
  | { state: 'error'; message: string; url: string }

let winRef: BrowserWindow | null = null

export function setUpdaterWindow(win: BrowserWindow): void {
  winRef = win
}

function emit(status: UpdateState): void {
  winRef?.webContents.send('update:status', status)
}

/** 简单语义化版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0 */
function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da > db ? 1 : -1
  }
  return 0
}

/**
 * 检查 GitHub Release 是否有新版本。
 * @param silent 静默模式（启动自动检查用）：仅在发现新版本时通知，避免打扰；
 *               失败时也不弹错误（网络不可达时静默忽略）。
 */
export async function checkForUpdates(silent = false): Promise<void> {
  if (!silent) emit({ state: 'checking' })
  try {
    const res = await fetch(LATEST_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bilibili-mp3-downloader'
      }
    })
    if (!res.ok) throw new Error(`GitHub API 返回 ${res.status}`)
    const data = (await res.json()) as { tag_name: string; html_url: string; body?: string }
    const latest = data.tag_name.replace(/^v/i, '')
    const current = app.getVersion()
    if (compareVersion(latest, current) > 0) {
      emit({ state: 'available', version: latest, url: data.html_url, notes: data.body })
    } else if (!silent) {
      emit({ state: 'latest', version: current })
    }
  } catch {
    // 网络不可达（如中国网络无法连接 GitHub）时，给出手动查看入口
    if (!silent) {
      emit({ state: 'error', message: '无法连接 GitHub，请手动查看更新', url: RELEASES_PAGE })
    }
  }
}
