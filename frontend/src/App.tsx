import { useEffect, useRef, useState } from 'react'
import {
  locate,
  generateIndigoText,
  editIndigo,
  regenerateIndigoImage,
  exportIndigoPpt,
  getAuthToken,
  getCurrentUser,
  getHistoryItem,
  listHistory,
  logout,
  onAuthExpired,
  type AuthUser,
  type GenerationHistoryItem,
  type IndigoImageTarget,
} from './api'
import type { IndigoStoryUnit } from './indigo_types'
import { MapPicker, reverseGeocode, type GeoResult } from './MapPicker'
import { MapBackdrop } from './MapBackdrop'
import { Concierge, type ConciergeMessage } from './Concierge'
import { StepNav, type StepDef } from './StepNav'
import { IndigoTextStage } from './stages/IndigoTextStage'
import { IndigoImageStage, indigoImageTargetLabel } from './stages/IndigoImageStage'
import { IndigoStructureStage } from './stages/IndigoStructureStage'
import { IndigoExportStage } from './stages/IndigoExportStage'
import { clearFastState, clearState, loadFastState, loadState, saveState } from './session'
import { FastLane } from './FastLane'
import { AuthScreen } from './AuthScreen'
import { Dashboard } from './Dashboard'
import { useIndigoImageJob } from './useIndigoImageJob'

const STEP_DEFS: { num: number; label: string; sublabel: string }[] = [
  { num: 1, label: '选址', sublabel: 'Pick a neighborhood' },
  { num: 2, label: '文字', sublabel: 'Confirm the story' },
  { num: 3, label: '图片', sublabel: 'Shape the imagery' },
  { num: 4, label: '结构', sublabel: 'Arrange the deck' },
  { num: 5, label: '导出', sublabel: 'Export PPT' },
]

function now() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const INITIAL_VIEW = { longitude: 116.4074, latitude: 39.9042, zoom: 11 }

const rawPersisted = loadState()
const wasStuckMidGenerate = !!(rawPersisted && rawPersisted.step >= 2 && !rawPersisted.story)
const persisted = wasStuckMidGenerate
  ? { step: 1, candidate: rawPersisted!.candidate, story: null, messages: [] }
  : rawPersisted

type AppMode = 'home' | 'fast' | 'guided'

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

const persistedFastRecovery = loadFastState()
const hasGuidedRecovery = !!persisted && (
  persisted.step > 1 ||
  persisted.candidate !== null ||
  persisted.story !== null ||
  persisted.messages.length > 0
)

export default function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [history, setHistory] = useState<GenerationHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [appMode, setAppMode] = useState<AppMode>(
    persistedFastRecovery ? 'fast' : hasGuidedRecovery ? 'guided' : 'home',
  )
  const [fastInitialStory, setFastInitialStory] = useState<IndigoStoryUnit | null>(null)
  const [openingHistoryId, setOpeningHistoryId] = useState<string | null>(null)
  const [step, setStep] = useState(persisted?.step ?? 1)
  const [viewState, setViewState] = useState(() =>
    persisted?.candidate
      ? { longitude: persisted.candidate.longitude, latitude: persisted.candidate.latitude, zoom: 13 }
      : INITIAL_VIEW,
  )
  const [candidate, setCandidate] = useState<GeoResult | null>(persisted?.candidate ?? null)
  const [story, setStory] = useState<IndigoStoryUnit | null>(persisted?.story ?? null)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [startingImages, setStartingImages] = useState(false)
  const [selectedImage, setSelectedImage] = useState<IndigoImageTarget | null>(null)
  const [regeneratingImage, setRegeneratingImage] = useState<IndigoImageTarget | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportedAt, setExportedAt] = useState<number | null>(null)
  const [messages, setMessages] = useState<ConciergeMessage[]>(persisted?.messages ?? [])
  const [error, setError] = useState('')
  const terminalImageNoticeRef = useRef('')
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
  const imagingPics = startingImages || imageJobActive

  async function refreshHistory() {
    if (!getAuthToken()) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    setHistoryError('')
    try {
      setHistory(await listHistory())
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '历史记录读取失败')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    async function bootstrapAuth() {
      if (!getAuthToken()) {
        setAuthChecked(true)
        return
      }
      try {
        const current = await getCurrentUser()
        setUser(current)
        await refreshHistory()
      } catch {
        setUser(null)
      } finally {
        setAuthChecked(true)
      }
    }
    void bootstrapAuth()
  }, [])

  useEffect(() => {
    return onAuthExpired(() => {
      setUser(null)
      setHistory([])
      setFastInitialStory(null)
      clearFastState()
      setAppMode('home')
      setStory(null)
      setCandidate(null)
      setMessages([])
      setError('')
      clearImageJob()
      clearState()
    })
  }, [clearImageJob])

  useEffect(() => {
    if (!user) return
    saveState({ step, candidate, story, messages })
  }, [step, candidate, story, messages, user])

  useEffect(() => {
    if (!imageJob) return
    setStory(imageJob.story)
  }, [imageJob])

  useEffect(() => {
    if (!story?.image_job_id || hasIndigoImages(story)) return
    if (imageJob?.id === story.image_job_id) return
    void resumeImageJob(story.image_job_id).catch(() => undefined)
    // Resume is keyed by the persisted job id, not by each story image update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageJob?.id, story?.image_job_id])

  useEffect(() => {
    if (!imageJob || imageJob.status === 'queued' || imageJob.status === 'running') return
    const noticeKey = `${imageJob.id}:${imageJob.status}:${imageJob.completed}:${imageJob.failed}`
    if (terminalImageNoticeRef.current === noticeKey) return
    terminalImageNoticeRef.current = noticeKey

    const content =
      imageJob.status === 'completed'
        ? '图都到了。每个 touchpoint 的主图、Mood、设计灵感和空间细节都可以单独换。'
        : imageJob.status === 'cancelled'
          ? `图片任务已取消，已保留 ${imageJob.completed} 张图片。`
          : `图片完成 ${imageJob.completed} 张，${imageJob.failed} 张需要重试。`
    setMessages(prev => [...prev, {
      role: 'agent',
      content,
      timestamp: now(),
      step: 3,
    }])
    void refreshHistory()
    // History refresh is a side effect of a terminal job transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageJob?.completed, imageJob?.failed, imageJob?.id, imageJob?.status])

  useEffect(() => {
    if (wasStuckMidGenerate) {
      const recovered = persisted?.candidate ?? null
      setMessages([
        {
          role: 'agent',
          content: '上次刷新打断了生成。' + (recovered ? '要重新走一趟吗？' : '回到选址重新来。'),
          timestamp: now(),
          step: 1,
          action: recovered ? { label: '重新生成', onClick: () => confirmLocation(recovered) } : undefined,
        },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pushMessage(m: ConciergeMessage) {
    setMessages(prev => [...prev, m])
  }

  function hasIndigoImages(s: IndigoStoryUnit) {
    return s.beats.every(b => !!b.image_url && !!b.mood_image_url && !!b.col2_image_url && !!b.col3_image_url)
  }

  function renumberIndigoBeats(beats: IndigoStoryUnit['beats']) {
    return beats.map((beat, i) => ({ ...beat, num: String(i + 1).padStart(2, '0') }))
  }

  async function triggerImageGen(s: IndigoStoryUnit) {
    setStartingImages(true)
    pushMessage({
      role: 'agent',
      content: '开始生成这套 Indigo 图片。',
      timestamp: now(),
      step: 3,
    })
    try {
      const created = await startImageJob(s)
      setStory(created.story)
    } catch (e) {
      pushMessage({
        role: 'agent',
        content: `图片任务没有启动：${e instanceof Error ? e.message : 'unknown'}`,
        timestamp: now(),
        step: 3,
      })
    } finally {
      setStartingImages(false)
    }
  }

  useEffect(() => {
    if (step !== 3 || !story || imagingPics) return
    if (hasIndigoImages(story)) return
    if (story.image_job_id) return
    void triggerImageGen(story)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function flyTo(r: GeoResult) {
    setViewState({ longitude: r.longitude, latitude: r.latitude, zoom: 13 })
  }

  async function confirmLocation(r: GeoResult) {
    setCandidate(r)
    setStep(2)
    setError('')
    setGenerating(true)
    pushMessage({
      role: 'agent',
      content: `好。先为 ${r.city} · ${r.neighborhood} 生成 Indigo 22 页故事文字。`,
      timestamp: now(),
      step: 2,
    })
    try {
      const result = await generateIndigoText(r.city, r.neighborhood)
      setStory(result)
      pushMessage({
        role: 'agent',
        content: `文字稿好了。我给了 ${result.taglines.length} 个标题方向、3 个源起角度和 ${result.beats.length} 个酒店触点。先看文字。`,
        timestamp: now(),
        step: 2,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      pushMessage({
        role: 'agent',
        content: `出了点问题：${e instanceof Error ? e.message : 'unknown'}。回到选址再来一次？`,
        timestamp: now(),
        step: 2,
      })
    } finally {
      setGenerating(false)
    }
  }

  async function handleMapClick(lng: number, lat: number) {
    if (step !== 1) return
    setSearching(true)
    try {
      const r = await reverseGeocode(lng, lat)
      if (r) {
        setCandidate(r)
        flyTo(r)
        pushMessage({
          role: 'agent',
          content: `看了一下：${r.city} · ${r.neighborhood}（${r.display}）。要用这里？`,
          timestamp: now(),
          step: 1,
          action: { label: '用这里', onClick: () => confirmLocation(r) },
        })
      } else {
        pushMessage({
          role: 'agent',
          content: '这个点没识别出来。换一处试试？',
          timestamp: now(),
          step: 1,
        })
      }
    } catch (e) {
      pushMessage({
        role: 'agent',
        content: `识别失败：${e instanceof Error ? e.message : 'unknown'}`,
        timestamp: now(),
        step: 1,
      })
    } finally {
      setSearching(false)
    }
  }

  async function handleSendInstruction(instruction: string) {
    pushMessage({ role: 'user', content: instruction, timestamp: now(), step })

    if (step === 1) {
      setSearching(true)
      try {
        const { reply, candidate: cand } = await locate(instruction, messages)
        if (cand) {
          setCandidate(cand)
          flyTo(cand)
          pushMessage({
            role: 'agent',
            content: reply,
            timestamp: now(),
            step: 1,
            action: { label: '用这里', onClick: () => confirmLocation(cand) },
          })
        } else {
          pushMessage({
            role: 'agent',
            content: reply,
            timestamp: now(),
            step: 1,
          })
        }
      } catch (e) {
        pushMessage({
          role: 'agent',
          content: `没接通：${e instanceof Error ? e.message : 'unknown'}。再试一次？`,
          timestamp: now(),
          step: 1,
        })
      } finally {
        setSearching(false)
      }
      return
    }

    if (step === 2) {
      if (!story) return
      setEditing(true)
      try {
        const updated = await editIndigo(story, instruction, messages)
        setStory(updated)
        pushMessage({
          role: 'agent',
          content: '改好了。看看这版？',
          timestamp: now(),
          step: 2,
        })
      } catch (e) {
        pushMessage({
          role: 'agent',
          content: `没改成：${e instanceof Error ? e.message : 'unknown'}。换个说法再试？`,
          timestamp: now(),
          step: 2,
        })
      } finally {
        setEditing(false)
      }
      return
    }

    if (step === 4) {
      if (!story) return
      setEditing(true)
      try {
        const updated = await editIndigo(story, instruction, messages)
        setStory(updated)
        pushMessage({
          role: 'agent',
          content: '改好了。再看看？',
          timestamp: now(),
          step: 4,
        })
      } catch (e) {
        pushMessage({
          role: 'agent',
          content: `没改成：${e instanceof Error ? e.message : 'unknown'}。`,
          timestamp: now(),
          step: 4,
        })
      } finally {
        setEditing(false)
      }
      return
    }

    if (step === 3) {
      if (!story) return
      if (!selectedImage) {
        pushMessage({
          role: 'agent',
          content: '先点一张图选中，再告诉我怎么改。',
          timestamp: now(),
          step: 3,
        })
        return
      }
      const target = selectedImage
      const targetLabel = indigoImageTargetLabel(story, target)
      setRegeneratingImage(target)
      try {
        const newUrl = await regenerateIndigoImage(story, target, instruction, messages)
        setStory(prev => {
          if (!prev) return prev
          const beats = prev.beats.map((b, i) =>
            i === target.beatIndex ? { ...b, [target.field]: newUrl } : b,
          )
          return { ...prev, beats }
        })
        setSelectedImage(null)
        pushMessage({
          role: 'agent',
          content: `「${targetLabel}」换好了。看看这版？`,
          timestamp: now(),
          step: 3,
        })
      } catch (e) {
        pushMessage({
          role: 'agent',
          content: `没改成：${e instanceof Error ? e.message : 'unknown'}。换个说法再试？`,
          timestamp: now(),
          step: 3,
        })
      } finally {
        setRegeneratingImage(null)
      }
      return
    }

    pushMessage({
      role: 'agent',
      content: '这一步还在搭建（Phase 2）。先回到「文字」继续？',
      timestamp: now(),
      step,
    })
  }

  async function handleExport() {
    if (!story) return
    setExporting(true)
    setError('')
    pushMessage({
      role: 'agent',
      content: '正在用 Indigo 22 页模板生成可编辑 PPTX。',
      timestamp: now(),
      step: 5,
    })
    try {
      await exportIndigoPpt(story)
      setExportedAt(Date.now())
      pushMessage({
        role: 'agent',
        content: '导出完成。这一版和一键生成共用同一个可编辑 PPTX builder。',
        timestamp: now(),
        step: 5,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
      pushMessage({
        role: 'agent',
        content: `导出失败：${e instanceof Error ? e.message : 'unknown'}`,
        timestamp: now(),
        step: 5,
      })
    } finally {
      setExporting(false)
    }
  }

  function reorderBeat(fromIndex: number, toIndex: number) {
    if (!story) return
    if (toIndex < 0 || toIndex >= story.beats.length) return
    const beats = [...story.beats]
    const [moved] = beats.splice(fromIndex, 1)
    beats.splice(toIndex, 0, moved)
    setStory({ ...story, beats: renumberIndigoBeats(beats) })
  }

  function handleJump(target: number) {
    if (target === 1) {
      clearImageJob()
      setStep(1)
      setStory(null)
      setCandidate(null)
      setMessages([])
      setError('')
      clearState()
      return
    }
    setStep(target)
  }

  function handleGoHome() {
    clearImageJob()
    setAppMode('home')
    setFastInitialStory(null)
    clearFastState()
    setStep(1)
    setStory(null)
    setCandidate(null)
    setMessages([])
    setError('')
    clearState()
    void refreshHistory()
  }

  function handleStartFast() {
    setFastInitialStory(null)
    setAppMode('fast')
  }

  function handleStartGuided() {
    clearImageJob()
    clearFastState()
    setStep(1)
    setStory(null)
    setCandidate(null)
    setMessages([])
    setError('')
    clearState()
    setAppMode('guided')
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // Local logout should still happen even if the server session is already gone.
    }
    setUser(null)
    setHistory([])
    setFastInitialStory(null)
    clearFastState()
    setAppMode('home')
    setStory(null)
    setCandidate(null)
    setMessages([])
    clearImageJob()
    clearState()
  }

  async function openHistoryItem(item: GenerationHistoryItem) {
    setOpeningHistoryId(item.id)
    setHistoryError('')
    try {
      const detail = await getHistoryItem(item.id)
      if (!isIndigoStory(detail.story)) {
        setHistoryError('这条历史记录还是旧格式，不能用新的 Indigo 22 页生成器打开。')
        return
      }
      if (detail.mode === 'fast') {
        setFastInitialStory(detail.story)
        setAppMode('fast')
        return
      }
      setStory(detail.story)
      setStep(hasIndigoImages(detail.story) ? 4 : 3)
      setMessages([{
        role: 'agent',
        content: `已打开历史记录：${detail.title}`,
        timestamp: now(),
        step: 4,
      }])
      setAppMode('guided')
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '历史记录打开失败')
    } finally {
      setOpeningHistoryId(null)
    }
  }

  const stepDefs: StepDef[] = STEP_DEFS.map(s => ({
    num: s.num,
    label: s.label,
    enabled: s.num === 1 || (story !== null && s.num <= 5),
  }))

  const conciergeStepLabel = STEP_DEFS[step - 1]?.sublabel ?? ''
  const conciergeThinking =
    generating || editing || searching || imagingPics || regeneratingImage !== null || exporting
  const conciergeDisabled = generating || imagingPics || exporting

  const stepPlaceholder =
    step === 1
      ? '比如「上海 徐汇」、「成都 玉林」'
      : step === 2
      ? '告诉我要怎么改文字…'
      : step === 3
      ? '比如「这张换成黄昏」、「Mood 再 cinematic 一些」'
      : step === 4
      ? '比如「把第 3 个 touchpoint 放前面」、「入口先讲」'
      : step === 5
      ? '点导出 PPT 下载，或者回上一步再改。'
      : 'Ask the concierge…'

  const stepHint =
    step === 1
      ? '告诉我你想做哪里的 PPT。可以直接说「上海 武康路」、「我想要北京胡同的感觉」，或者直接点地图。'
      : step === 3
      ? selectedImage
        ? '告诉我这张图要怎么改。比如「换成黄昏」、「再 cinematic 一些」、「人多一点」。'
        : '点一张图选中，再让我改它。'
      : step === 4
      ? '↑↓ 调整 touchpoint 顺序。逐步导出会使用和一键生成同一套 22 页 PPTX builder。'
      : step === 5
      ? '都改完了？点下面的导出 PPT 下载文件。'
      : undefined

  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="w-8 h-8 border-2 border-[#c8a96e]/30 border-t-[#c8a96e] rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onAuthed={u => {
      setUser(u)
      void refreshHistory()
    }} />
  }

  if (appMode === 'home') {
    return (
      <Dashboard
        user={user}
        history={history}
        historyLoading={historyLoading}
        historyError={historyError}
        openingHistoryId={openingHistoryId}
        onRefreshHistory={() => void refreshHistory()}
        onOpenHistory={item => void openHistoryItem(item)}
        onStartFast={handleStartFast}
        onStartGuided={handleStartGuided}
        onLogout={() => void handleLogout()}
      />
    )
  }

  if (appMode === 'fast') {
    return (
      <FastLane
        initialStory={fastInitialStory}
        onHistoryChanged={() => void refreshHistory()}
        onBack={() => {
          setFastInitialStory(null)
          clearFastState()
          setAppMode('home')
          void refreshHistory()
        }}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      <StepNav steps={stepDefs} current={step} onJump={handleJump} onHome={handleGoHome} />

      <main className="flex-1 relative overflow-hidden">
        {(step === 2 || step === 3) && candidate && (
          <MapBackdrop longitude={candidate.longitude} latitude={candidate.latitude} />
        )}

        {step === 1 && (
          <div className="absolute inset-0">
            <MapPicker
              viewState={viewState}
              onViewStateChange={setViewState}
              pin={candidate ? { longitude: candidate.longitude, latitude: candidate.latitude } : null}
              onMapClick={handleMapClick}
            />
          </div>
        )}

        {step === 2 && (
          <div className="absolute inset-0 pr-[412px]">
            <IndigoTextStage
              story={story}
              loading={generating}
              pendingLocation={candidate ? { city: candidate.city, district: candidate.neighborhood } : null}
              onNext={() => setStep(3)}
            />
          </div>
        )}

        {step === 3 && story && (
          <div className="absolute inset-0 pr-[412px]">
            <IndigoImageStage
              story={story}
              loading={imagingPics}
              job={imageJob}
              jobError={imageJobError}
              jobActionBusy={imageJobActionBusy}
              selected={selectedImage}
              regenerating={regeneratingImage}
              onSelect={setSelectedImage}
              onStart={() => void startImageJob(story)}
              onCancel={() => void cancelImageJob()}
              onRetry={() => void retryImageJob()}
              onRestart={() => void startImageJob(imageJob?.story ?? story)}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          </div>
        )}

        {step === 4 && story && (
          <div className="absolute inset-0 pr-[412px]">
            <IndigoStructureStage
              story={story}
              onReorder={reorderBeat}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
            />
          </div>
        )}

        {step === 5 && story && (
          <div className="absolute inset-0 pr-[412px]">
            <IndigoExportStage
              story={story}
              exporting={exporting}
              exportedAt={exportedAt}
              onExport={handleExport}
              onBack={() => setStep(4)}
            />
          </div>
        )}

        <Concierge
          messages={messages}
          onSend={handleSendInstruction}
          thinking={conciergeThinking}
          disabled={conciergeDisabled}
          currentStep={step}
          stepLabel={conciergeStepLabel}
          placeholder={stepPlaceholder}
          emptyHint={stepHint}
        />
      </main>

      {error && (
        <div className="fixed bottom-6 left-6 bg-red-900/80 backdrop-blur text-red-200 text-sm px-4 py-2 rounded z-50">
          {error}
        </div>
      )}
    </div>
  )
}
