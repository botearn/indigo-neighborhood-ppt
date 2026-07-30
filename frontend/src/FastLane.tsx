import { useEffect, useRef, useState } from 'react'
import type { IndigoStoryUnit } from './indigo_types'
import {
  generateIndigoFastText,
  exportIndigoPpt,
  getHistoryItem,
  listHistory,
  type GenerationHistoryItem,
} from './api'
import { IndigoPreview } from './IndigoSlides'
import { BackButton } from './BackButton'
import {
  FastDeckReady,
  FastGenerationWorkspace,
  FastTextGeneration,
} from './FastGenerationWorkspace'
import { useIndigoImageJob } from './useIndigoImageJob'
import { clearFastState, loadFastState, saveFastState } from './session'

type Phase = 'idle' | 'generating' | 'preview' | 'exporting'

function hasAllImages(story: IndigoStoryUnit | null): boolean {
  return !!story && story.beats.every(
    beat => !!beat.image_url && !!beat.mood_image_url && !!beat.col2_image_url && !!beat.col3_image_url,
  )
}

function isIndigoStory(value: unknown): value is IndigoStoryUnit {
  if (!value || typeof value !== 'object') return false
  const story = value as Partial<IndigoStoryUnit>
  return (
    typeof story.city === 'string' &&
    typeof story.district === 'string' &&
    Array.isArray(story.taglines) &&
    Array.isArray(story.origins) &&
    Array.isArray(story.beats) &&
    Array.isArray(story.concept_poem)
  )
}

export function FastLane({
  onBack,
  initialStory = null,
  onHistoryChanged,
}: {
  onBack: () => void
  initialStory?: IndigoStoryUnit | null
  onHistoryChanged?: () => void
}) {
  const [recovery] = useState(() => loadFastState())
  const [city, setCity] = useState(initialStory?.city ?? recovery?.city ?? '')
  const [district, setDistrict] = useState(initialStory?.district ?? recovery?.district ?? '')
  const [phase, setPhase] = useState<Phase>(initialStory || recovery ? 'generating' : 'idle')
  const [story, setStory] = useState<IndigoStoryUnit | null>(initialStory)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<GenerationHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [openingHistoryId, setOpeningHistoryId] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const {
    job: imageJob,
    error: imageJobError,
    actionBusy: imageJobActionBusy,
    active: imageJobActive,
    start: startImageJob,
    resume: resumeImageJob,
    retry: retryImageJob,
    cancel: cancelImageJob,
    clear: clearImageJob,
  } = useIndigoImageJob()
  const imagesComplete = hasAllImages(story)

  useEffect(() => {
    if (!initialStory) return
    clearImageJob()
    setStory(initialStory)
    setCity(initialStory.city)
    setDistrict(initialStory.district)
    setPhase('preview')
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0 }))
  }, [clearImageJob, initialStory])

  useEffect(() => {
    if (!story?.image_job_id || imagesComplete) return
    if (imageJob?.id === story.image_job_id) return
    void resumeImageJob(story.image_job_id).catch(() => undefined)
  }, [imageJob?.id, imagesComplete, resumeImageJob, story?.image_job_id])

  useEffect(() => {
    if (!imageJob) return
    setStory(imageJob.story)
  }, [imageJob])

  useEffect(() => {
    if (!imageJob || imageJob.status === 'queued' || imageJob.status === 'running') return
    onHistoryChanged?.()
    void refreshHistory()
    // Refresh callbacks do not participate in image job state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageJob?.id, imageJob?.status])

  useEffect(() => {
    void refreshHistory()
  }, [])

  useEffect(() => {
    const historyId = recovery?.history_id
    if (initialStory || !historyId) return
    const recoverableHistoryId = historyId
    async function restoreFromHistory() {
      try {
        const detail = await getHistoryItem(recoverableHistoryId)
        if (detail.mode !== 'fast' || !isIndigoStory(detail.story)) {
          throw new Error('这条历史记录不能恢复为一键 Indigo deck。')
        }
        setStory(detail.story)
        setCity(detail.story.city)
        setDistrict(detail.story.district)
        setPhase('preview')
        requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0 }))
      } catch (cause) {
        clearFastState()
        setError(cause instanceof Error ? cause.message : '一键任务恢复失败')
        setPhase('idle')
      }
    }
    void restoreFromHistory()
  }, [initialStory, recovery])

  useEffect(() => {
    if (story) saveFastState(story)
  }, [story])

  async function refreshHistory() {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const items = await listHistory()
      setHistory(items.filter(item => item.mode === 'fast'))
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '历史记录读取失败')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleGenerate() {
    const c = city.trim(), d = district.trim()
    if (!c || !d) return
    setError('')
    setPhase('generating')
    clearImageJob()
    try {
      const result = await generateIndigoFastText(c, d)
      setStory(result)
      setPhase('preview')
      requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0 }))
      onHistoryChanged?.()
      void refreshHistory()
      try {
        await startImageJob(result)
      } catch (imageError) {
        setError(imageError instanceof Error ? imageError.message : '图片任务创建失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请重试')
      setPhase('idle')
    }
  }

  async function handleExport() {
    if (!story || imageJobActive || !imagesComplete) return
    setPhase('exporting')
    try {
      await exportIndigoPpt(story)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    } finally {
      setPhase('preview')
    }
  }

  async function handleReset() {
    if (imageJobActive) {
      try {
        await cancelImageJob()
      } catch {
        // Reset the local view even if the cancellation request cannot be delivered.
      }
    }
    clearImageJob()
    clearFastState()
    setStory(null)
    setCity('')
    setDistrict('')
    setPhase('idle')
    setError('')
    void refreshHistory()
  }

  async function openHistoryItem(item: GenerationHistoryItem) {
    setOpeningHistoryId(item.id)
    setHistoryError('')
    setError('')
    try {
      const detail = await getHistoryItem(item.id)
      if (detail.mode !== 'fast' || !isIndigoStory(detail.story)) {
        setHistoryError('这条历史记录不是可打开的一键 Indigo deck。')
        return
      }
      setStory(detail.story)
      setCity(detail.story.city)
      setDistrict(detail.story.district)
      setPhase('preview')
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '历史记录打开失败')
    } finally {
      setOpeningHistoryId(null)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <header className="min-h-16 px-3 py-2 sm:px-6 flex items-center justify-between gap-2 border-b border-[#1e1e1c] bg-[#0f0f0f]/95 backdrop-blur-sm shrink-0">
        <div className="min-w-0 flex items-center gap-2 sm:gap-3">
          <BackButton
            onClick={onBack}
            disabled={phase === 'generating' || phase === 'exporting'}
          />
          <span className="hidden sm:inline font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">Hotel Indigo</span>
          <span className="text-[13px] sm:text-[15px] font-light text-[#f5f5f0]/85 whitespace-nowrap">一键生成</span>
          {story && phase === 'preview' && (
            <span className="hidden md:inline truncate text-[12px] text-[#6b7280]">· {story.city} {story.district} · 22 页</span>
          )}
        </div>
        {phase === 'preview' && (
          <div className="shrink-0 flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => void handleReset()}
              disabled={imageJobActionBusy}
              className="hidden sm:inline font-mono text-[11px] tracking-wider text-[#6b7280] hover:text-[#a8a8a0] transition disabled:opacity-40"
            >
              重新生成
            </button>
            <button
              onClick={handleExport}
              disabled={imageJobActive || !imagesComplete}
              className="bg-[#c8a96e] hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed text-[#0f0f0f] font-mono text-[10px] sm:text-[11px] tracking-[0.14em] sm:tracking-[0.2em] uppercase px-3 sm:px-5 py-2 rounded transition"
            >
              <span className="sm:hidden">导出</span>
              <span className="hidden sm:inline">导出 PPTX</span>
            </button>
          </div>
        )}
      </header>

      {/* Main */}
      <main ref={mainRef} className="flex-1 overflow-y-auto">

        {/* Idle: input form */}
        {phase === 'idle' && (
          <div className="flex items-center justify-center min-h-full px-6 py-12">
            <div className="w-full max-w-[900px] grid grid-cols-1 md:grid-cols-[minmax(0,440px)_minmax(280px,1fr)] gap-10">
              <div className="flex flex-col gap-7">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-3">FAST LANE</div>
                  <h1 className="text-[26px] font-light text-[#f5f5f0] leading-tight">输入地点，直接出片</h1>
                  <p className="text-sm text-[#6b7280] mt-2 leading-relaxed">
                    文字先完成，场景图片随后逐张生成，最终导出 22 页可编辑 PPTX。
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">城市</label>
                    <input
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                      placeholder="上海"
                      autoFocus
                      className="bg-[#1a1a18] border border-[#2a2a28] focus:border-[#c8a96e]/50 rounded px-4 py-3 text-[#f5f5f0] text-sm placeholder:text-[#3a3a38] outline-none transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">街区 / 地点</label>
                    <input
                      value={district}
                      onChange={e => setDistrict(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                      placeholder="新天地"
                      className="bg-[#1a1a18] border border-[#2a2a28] focus:border-[#c8a96e]/50 rounded px-4 py-3 text-[#f5f5f0] text-sm placeholder:text-[#3a3a38] outline-none transition"
                    />
                  </div>
                </div>
                {error && (
                  <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-4 py-3">{error}</div>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={!city.trim() || !district.trim()}
                  className="bg-[#c8a96e] hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed text-[#0f0f0f] font-mono text-[11px] tracking-[0.25em] uppercase px-6 py-3.5 rounded transition"
                >
                  一键生成
                </button>
              </div>

              <section className="border-l border-[#1e1e1c] md:pl-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">History</div>
                    <div className="text-sm text-[#f5f5f0]/80 mt-1">一键生成记录</div>
                  </div>
                  <button
                    onClick={() => void refreshHistory()}
                    disabled={historyLoading}
                    className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#6b7280] hover:text-[#a8a8a0] transition disabled:opacity-40"
                  >
                    刷新
                  </button>
                </div>
                {historyError && (
                  <div className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-4 py-3">
                    {historyError}
                  </div>
                )}
                {historyLoading ? (
                  <div className="text-sm text-[#6b7280]">正在读取历史…</div>
                ) : history.length === 0 ? (
                  <div className="text-sm text-[#6b7280] leading-relaxed">
                    还没有一键生成记录。生成完成后会出现在这里。
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                    {history.map(item => (
                      <button
                        key={item.id}
                        onClick={() => void openHistoryItem(item)}
                        disabled={openingHistoryId !== null}
                        className="text-left bg-[#1a1a18] hover:bg-[#1e1e1c] border border-[#2a2a28] hover:border-[#c8a96e]/35 rounded p-4 transition disabled:opacity-50 disabled:cursor-wait"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm text-[#f5f5f0] leading-snug">{item.title}</span>
                          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#c8a96e]/70">
                            {openingHistoryId === item.id ? '打开中' : 'FAST'}
                          </span>
                        </div>
                        <div className="text-xs text-[#6b7280] mt-2">
                          {new Date(item.updated_at * 1000).toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* Generating */}
        {phase === 'generating' && (
          <FastTextGeneration city={city} district={district} />
        )}

        {phase === 'exporting' && (
          <div className="flex items-center justify-center min-h-full">
            <div className="flex flex-col items-center gap-8 text-center">
              <div className="w-10 h-10 border-2 border-[#c8a96e]/30 border-t-[#c8a96e] rounded-full animate-spin" />
              <div>
                <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-2">
                  导出中
                </div>
                <div className="text-[#f5f5f0] text-[17px] font-light">
                  正在生成可编辑 PPTX…
                </div>
                <div className="text-[#6b7280] text-xs mt-2">
                  22 页 · 图片与版式正在写入
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview: scrollable slides */}
        {phase === 'preview' && story && (
          <>
            {error && (
              <div className="mx-6 mt-4 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-4 py-3">
                {error}
              </div>
            )}
            {imagesComplete ? (
              <>
                <FastDeckReady story={story} />
                <IndigoPreview story={story} />
              </>
            ) : (
              <FastGenerationWorkspace
                story={story}
                job={imageJob}
                error={imageJobError}
                actionBusy={imageJobActionBusy}
                onStart={() => void startImageJob(story)}
                onCancel={() => void cancelImageJob()}
                onRetry={() => void retryImageJob()}
                onRestart={() => void startImageJob(imageJob?.story ?? story)}
              />
            )}
          </>
        )}
      </main>

    </div>
  )
}
