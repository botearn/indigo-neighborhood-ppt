import type { IndigoImageJob } from './api'

type Props = {
  job: IndigoImageJob
  error?: string
  actionBusy?: boolean
  onCancel: () => void
  onRetry: () => void
  onRestart: () => void
}

const STATUS_LABELS: Record<IndigoImageJob['status'], string> = {
  queued: '等待生成',
  running: '生成图片',
  partial: '部分完成',
  completed: '图片完成',
  failed: '任务失败',
  cancelled: '已取消',
}

export function ImageJobProgress({
  job,
  error,
  actionBusy = false,
  onCancel,
  onRetry,
  onRestart,
}: Props) {
  const completedPercent = job.total ? (job.completed / job.total) * 100 : 0
  const failedPercent = job.total ? (job.failed / job.total) * 100 : 0
  const active = job.status === 'queued' || job.status === 'running'
  const retryable = (job.status === 'partial' || job.status === 'failed') && job.failed > 0
  const failureMessage = error || Object.values(job.errors)[0]

  return (
    <section className="border-y border-[#2a2a28] bg-[#141412] px-3 py-4 sm:px-5" aria-live="polite">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#c8a96e]">
              {STATUS_LABELS[job.status]}
            </span>
            <span className="font-mono text-[10px] text-[#8b8b84] tabular-nums">
              {job.completed} / {job.total}
              {job.failed > 0 ? ` · ${job.failed} 失败` : ''}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden bg-[#2a2a28]">
            <div className="flex h-full">
              <div
                className="h-full bg-[#c8a96e] transition-[width] duration-500"
                style={{ width: `${completedPercent}%` }}
              />
              <div
                className="h-full bg-[#a84b43] transition-[width] duration-500"
                style={{ width: `${failedPercent}%` }}
              />
            </div>
          </div>
          {failureMessage && <p className="mt-2 text-xs text-red-400">{failureMessage}</p>}
        </div>

        <div className="shrink-0 self-end sm:self-auto">
          {active && (
            <button
              type="button"
              onClick={onCancel}
              disabled={actionBusy}
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b8b84] hover:text-[#f5f5f0] disabled:opacity-40"
            >
              取消
            </button>
          )}
          {retryable && (
            <button
              type="button"
              onClick={onRetry}
              disabled={actionBusy}
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#c8a96e] hover:text-[#e0c58f] disabled:opacity-40"
            >
              重试失败图片
            </button>
          )}
          {job.status === 'cancelled' && (
            <button
              type="button"
              onClick={onRestart}
              disabled={actionBusy}
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#c8a96e] hover:text-[#e0c58f] disabled:opacity-40"
            >
              继续生成
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
