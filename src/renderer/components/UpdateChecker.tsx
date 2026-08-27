import { useEffect, useState } from 'react'
import { RefreshCw, ArrowUpCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { UpdateState } from '../../shared/types'

export function UpdateChecker() {
  const [status, setStatus] = useState<UpdateState>({ state: 'idle' })
  const [busy, setBusy] = useState(false)

  useEffect(() => window.api.onUpdateStatus(setStatus), [])

  const handleCheck = async (): Promise<void> => {
    setBusy(true)
    await window.api.checkForUpdates()
    setBusy(false)
  }

  const openRelease = (url: string): void => {
    void window.api.openExternal(url)
  }

  if (status.state === 'checking' || busy) {
    return (
      <span className="flex items-center gap-1.5 text-cyan-300">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        检查更新中…
      </span>
    )
  }

  if (status.state === 'available') {
    return (
      <button
        onClick={() => openRelease(status.url)}
        className="flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-2.5 py-1 text-cyan-200 ring-1 ring-cyan-400/40 transition hover:bg-cyan-500/30"
      >
        <ArrowUpCircle className="h-3.5 w-3.5" />
        发现新版本 v{status.version}，前往下载
      </button>
    )
  }

  if (status.state === 'latest') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已是最新 v{status.version}
      </span>
    )
  }

  if (status.state === 'error') {
    return (
      <button
        onClick={() => openRelease(status.url)}
        className="flex items-center gap-1.5 text-amber-300 transition hover:text-amber-200"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {status.message}
      </button>
    )
  }

  return (
    <button
      onClick={() => void handleCheck()}
      className="flex items-center gap-1.5 text-slate-400 transition hover:text-slate-200"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      检查更新
    </button>
  )
}
