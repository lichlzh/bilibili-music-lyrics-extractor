import { useCallback, useEffect, useState } from 'react'
import { Music, Play, Trash2, ShieldAlert } from 'lucide-react'
import type { AlignMethod, Settings, SongItem, SongType } from '../shared/types'
import { AddSongForm } from './components/AddSongForm'
import { SongList } from './components/SongList'
import { SettingsBar } from './components/SettingsBar'

function uid(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [songs, setSongs] = useState<SongItem[]>([])
  const [settings, setSettings] = useState<Settings>({
    outputDir: '',
    concurrency: 2,
    alignMethod: 'signal'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getStore().then((data) => {
      setSongs(data.songs ?? [])
      setSettings(data.settings ?? { outputDir: '', concurrency: 2, alignMethod: 'signal' })
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const off = window.api.onProgress((p) => {
      setSongs((prev) => {
        const next = prev.map((s) =>
          s.id === p.id
            ? {
                ...s,
                percent: p.percent,
                status: p.status,
                message: p.message,
                outputPath: p.outputPath ?? s.outputPath,
                lyrics: p.lyrics ?? s.lyrics
              }
            : s
        )
        const hit = next.find((s) => s.id === p.id)
        if (hit && (hit.status === 'done' || hit.status === 'error' || hit.status === 'canceled')) {
          void window.api.setSongs(next)
        }
        return next
      })
    })
    return off
  }, [])

  const persistSongs = useCallback((next: SongItem[]) => {
    setSongs(next)
    void window.api.setSongs(next)
  }, [])

  const handleAdd = useCallback(
    (input: { name: string; type: SongType; url: string }) => {
      const item: SongItem = {
        id: uid(),
        name: input.name.trim(),
        type: input.type,
        url: input.url.trim(),
        status: 'waiting',
        percent: 0
      }
      persistSongs([...songs, item])
    },
    [songs, persistSongs]
  )

  const handleRemove = useCallback(
    (id: string) => {
      persistSongs(songs.filter((s) => s.id !== id))
    },
    [songs, persistSongs]
  )

  const handleCancel = useCallback((id: string) => {
    void window.api.cancel(id)
  }, [])

  const handleRecalibrate = useCallback((item: SongItem) => {
    void window.api.recalibrate(item)
  }, [])

  const handleStartAll = useCallback(() => {
    const next = songs.map((s) =>
      s.status === 'done' || s.status === 'error' || s.status === 'canceled'
        ? s
        : { ...s, status: 'waiting' as const, percent: 0, message: '' }
    )
    setSongs(next)
    void window.api.startAll(next, settings)
  }, [songs, settings])

  const handleClearDone = useCallback(() => {
    persistSongs(songs.filter((s) => s.status !== 'done'))
  }, [songs, persistSongs])

  const handleSelectDir = useCallback(async () => {
    const dir = await window.api.selectOutputDir()
    if (dir) {
      const next = { ...settings, outputDir: dir }
      setSettings(next)
      await window.api.setSettings(next)
    }
  }, [settings])

  const handleConcurrency = useCallback(
    async (n: number) => {
      const next = { ...settings, concurrency: n }
      setSettings(next)
      await window.api.setSettings(next)
    },
    [settings]
  )

  const handleAlignMethod = useCallback(
    async (m: AlignMethod) => {
      const next = { ...settings, alignMethod: m }
      setSettings(next)
      await window.api.setSettings(next)
    },
    [settings]
  )

  const activeCount = songs.filter(
    (s) => s.status === 'downloading' || s.status === 'converting'
  ).length
  const doneCount = songs.filter((s) => s.status === 'done').length

  return (
    <div className="flex h-full flex-col px-5 py-4">
      <header className="mb-4 flex items-center gap-3 animate-fade-in">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl btn-grad shadow-lg shadow-cyan-500/30">
          <Music className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">B站音乐下载器</h1>
          <p className="text-[13px] text-slate-400">粘贴 B 站链接 / BV 号，批量下载并转为 MP3</p>
        </div>
      </header>

      <SettingsBar
        settings={settings}
        onSelectDir={handleSelectDir}
        onConcurrency={handleConcurrency}
        onAlignMethod={handleAlignMethod}
      />

      <AddSongForm onAdd={handleAdd} />

      <div className="mt-3 mb-2 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={handleStartAll}
            disabled={activeCount > 0}
            className="btn-grad flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> 开始全部
          </button>
          <button
            onClick={handleClearDone}
            className="glass flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" /> 清空已完成
          </button>
        </div>
        <div className="text-[13px] text-slate-400">
          共 {songs.length} 首 · 进行中 {activeCount} · 已完成 {doneCount}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <p className="mt-10 text-center text-slate-500">加载中…</p>
        ) : (
          <SongList
            songs={songs}
            onRemove={handleRemove}
            onCancel={handleCancel}
            onOpenLyrics={(p) => void window.api.openLyrics(p)}
            onRecalibrate={handleRecalibrate}
          />
        )}
      </div>

      <footer className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3 text-[12px] text-slate-500">
        <ShieldAlert className="h-4 w-4 text-amber-400" />
        仅供个人学习 / 欣赏使用，请遵守 B 站及版权相关规定。
      </footer>
    </div>
  )
}
