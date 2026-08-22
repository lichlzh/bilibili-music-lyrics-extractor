import { useState } from 'react'
import { Plus, Link2 } from 'lucide-react'
import type { SongType } from '../../shared/types'

interface Props {
  onAdd: (input: { name: string; type: SongType; url: string }) => void
}

const TYPE_OPTIONS: SongType[] = ['原唱', '伴奏']

export function AddSongForm({ onAdd }: Props) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<SongType>('原唱')

  const canSubmit = url.trim().length > 0

  const submit = () => {
    if (!canSubmit) return
    onAdd({ name: name, type, url })
    setUrl('')
    setName('')
    setType('原唱')
  }

  return (
    <div className="glass-strong rounded-2xl p-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_auto_auto]">
        <label className="flex items-center gap-2 rounded-xl bg-black/30 px-3 ring-1 ring-white/10 focus-within:ring-cyan-400/60">
          <Link2 className="h-4 w-4 text-slate-400" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="B站链接 或 BV 号，如 BV1xx411c7mD"
            className="w-full bg-transparent py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </label>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="歌名（可空，留空用链接）"
          className="rounded-xl bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 placeholder:text-slate-500 focus:ring-cyan-400/60"
        />

        <select
          value={type}
          onChange={(e) => setType(e.target.value as SongType)}
          className="rounded-xl bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-cyan-400/60"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t} className="bg-slate-800">
              {t}
            </option>
          ))}
        </select>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="btn-grad flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-500/30 transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> 加入歌单
        </button>
      </div>
    </div>
  )
}
