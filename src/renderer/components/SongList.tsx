import { CheckCircle2, Loader2, AlertCircle, Ban, X, Music2, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AlignMethod, DownloadStatus, LyricsInfo, SongItem } from '../../shared/types'
import { STATUS_LABEL } from '../../shared/types'

interface Props {
  songs: SongItem[]
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onOpenLyrics: (path: string) => void
  onRecalibrate: (item: SongItem) => void
}

const LYRICS_STYLE: Record<LyricsInfo['status'], string> = {
  downloaded: 'text-emerald-300 bg-emerald-500/15',
  mismatch: 'text-amber-300 bg-amber-500/15',
  notfound: 'text-slate-400 bg-white/10'
}

function LyricsBadge({ lyrics, onOpen }: { lyrics: LyricsInfo; onOpen: (p: string) => void }) {
  const label =
    lyrics.status === 'downloaded'
      ? lyrics.synced
        ? '歌词'
        : '歌词(纯)'
      : lyrics.status === 'mismatch'
        ? '歌词?'
        : '无歌词'
  const badge = (
    <span
      title={lyrics.note}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${LYRICS_STYLE[lyrics.status]}`}
    >
      <FileText className="h-3 w-3" />
      {label}
    </span>
  )
  if (lyrics.status === 'downloaded' && lyrics.path) {
    return (
      <button onClick={() => onOpen(lyrics.path!)} className="transition hover:opacity-80" title={lyrics.note}>
        {badge}
      </button>
    )
  }
  return badge
}

const CALIBRATE_STYLE: Record<string, string> = {
  calibrating: 'text-cyan-300 bg-cyan-500/15',
  done: 'text-emerald-300 bg-emerald-500/15',
  failed: 'text-red-300 bg-red-500/15',
  source: 'text-amber-300 bg-amber-500/15',
  idle: 'text-slate-400 bg-white/10'
}

/** 把对齐方式枚举转成中文短名，便于徽标展示。 */
function methodName(m?: AlignMethod): string {
  if (m === 'signal') return '信号对齐'
  if (m === 'whisperx') return 'WhisperX'
  return ''
}

/** 歌词时间轴校准阶段的状态徽标：与“歌词下载”状态并列展示，明确显示是否校准及所用手段。 */
function CalibrateBadge({ lyrics }: { lyrics: LyricsInfo }) {
  if (lyrics.status === 'notfound') return null
  const m = methodName(lyrics.alignMethod)
  let cls = CALIBRATE_STYLE.idle
  let icon: ReactNode = <FileText className="h-3 w-3" />
  let label = '未校准'
  let title = '未做本地时间轴校准'
  if (lyrics.calibrateStatus === 'calibrating') {
    cls = CALIBRATE_STYLE.calibrating
    icon = <Loader2 className="h-3 w-3 animate-spin" />
    label = m ? `校准中·${m}` : '校准中'
    title = m ? `正在用本地音频做${m}…` : '正在用本地音频重新对齐时间轴'
  } else if (lyrics.calibrated) {
    cls = CALIBRATE_STYLE.done
    icon = <CheckCircle2 className="h-3 w-3" />
    label = m ? `已校准·${m}` : '已校准'
    title = m ? `已用${m}重新对齐时间轴` : '已用本地音频重新对齐时间轴'
  } else if (lyrics.calibrateStatus === 'failed') {
    cls = CALIBRATE_STYLE.failed
    icon = <AlertCircle className="h-3 w-3" />
    label = '校准失败'
    title = '本地校准失败，已保留原时间轴'
  } else if (lyrics.sourceSynced) {
    cls = CALIBRATE_STYLE.source
    icon = <FileText className="h-3 w-3" />
    label = '源时间轴'
    title = '未做本地校准，直接使用歌词源自带时间轴'
  }
  return (
    <span
      title={title}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {icon}
      {label}
    </span>
  )
}

const STATUS_STYLE: Record<DownloadStatus, string> = {
  waiting: 'text-slate-300 bg-white/10',
  downloading: 'text-cyan-300 bg-cyan-500/15',
  converting: 'text-indigo-300 bg-indigo-500/15',
  done: 'text-emerald-300 bg-emerald-500/15',
  error: 'text-red-300 bg-red-500/15',
  canceled: 'text-slate-400 bg-white/10'
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  if (status === 'downloading')
    return <Loader2 className="h-4 w-4 animate-spin" />
  if (status === 'converting')
    return <Loader2 className="h-4 w-4 animate-spin" />
  if (status === 'done') return <CheckCircle2 className="h-4 w-4" />
  if (status === 'error') return <AlertCircle className="h-4 w-4" />
  if (status === 'canceled') return <Ban className="h-4 w-4" />
  return <Music2 className="h-4 w-4" />
}

export function SongList({ songs, onRemove, onCancel, onOpenLyrics, onRecalibrate }: Props) {
  if (songs.length === 0) {
    return (
      <div className="mt-16 text-center text-slate-500">
        歌单还是空的，先添加一首 B 站歌曲吧～
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5 pb-4">
      {songs.map((s) => {
        const inProgress = s.status === 'downloading' || s.status === 'converting'
        return (
          <li
            key={s.id}
            className="glass rounded-2xl p-3.5 transition hover:bg-white/[0.08] animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl btn-grad/20 bg-white/5">
                <Music2 className="h-4 w-4 text-cyan-300" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium text-slate-100">
                    {s.name || s.url}
                  </span>
                  <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">
                    {s.type}
                  </span>
                </div>
                <p className="truncate text-[12px] text-slate-500">{s.url}</p>
              </div>

              <span
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${STATUS_STYLE[s.status]}`}
              >
                <StatusIcon status={s.status} />
                {STATUS_LABEL[s.status]}
              </span>

              {s.lyrics && <LyricsBadge lyrics={s.lyrics} onOpen={onOpenLyrics} />}
              {s.lyrics && <CalibrateBadge lyrics={s.lyrics} />}

              <div className="flex shrink-0 gap-1.5">
                {inProgress ? (
                  <button
                    onClick={() => onCancel(s.id)}
                    className="rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[12px] text-amber-300 transition hover:bg-amber-500/25"
                  >
                    取消
                  </button>
                ) : (
                  <>
                    {s.lyrics && s.lyrics.status !== 'notfound' && s.status === 'done' && (
                      <button
                        onClick={() => onRecalibrate(s)}
                        disabled={s.lyrics.calibrateStatus === 'calibrating'}
                        className="rounded-lg bg-indigo-500/15 px-2.5 py-1.5 text-[12px] text-indigo-300 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        重新校准
                      </button>
                    )}
                    <button
                      onClick={() => onRemove(s.id)}
                      className="rounded-lg bg-white/5 p-1.5 text-slate-400 transition hover:bg-red-500/20 hover:text-red-300"
                      aria-label="删除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {(inProgress || s.status === 'done') && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full btn-grad transition-all duration-300"
                  style={{ width: `${s.percent}%` }}
                />
              </div>
            )}

            {s.message && s.status !== 'downloading' && (
              <p className="mt-2 truncate text-[12px] text-slate-500">{s.message}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
