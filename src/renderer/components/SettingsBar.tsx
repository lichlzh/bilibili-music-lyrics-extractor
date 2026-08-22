import { FolderOpen, Cpu } from 'lucide-react'
import type { Settings } from '../../shared/types'

interface Props {
  settings: Settings
  onSelectDir: () => void
  onConcurrency: (n: number) => void
}

export function SettingsBar({ settings, onSelectDir, onConcurrency }: Props) {
  return (
    <div className="glass mb-3 flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
      <button
        onClick={onSelectDir}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-left ring-1 ring-white/10 transition hover:bg-white/10"
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-cyan-300" />
        <span className="truncate text-[13px] text-slate-200">
          {settings.outputDir || '点击选择输出目录'}
        </span>
      </button>

      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-slate-400" />
        <span className="text-[13px] text-slate-400">并发</span>
        <select
          value={settings.concurrency}
          onChange={(e) => onConcurrency(Number(e.target.value))}
          className="rounded-lg bg-black/30 px-2.5 py-1.5 text-[13px] text-slate-100 outline-none ring-1 ring-white/10 focus:ring-cyan-400/60"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n} className="bg-slate-800">
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
