import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import type { StoryUnit } from './types'
import { generate, edit, generateImages, regenerateImage, exportPpt, type ImageTarget } from './api'
import { SlideDeck } from './Slides'
import { MapPicker, forwardGeocode, reverseGeocode, type GeoResult } from './MapPicker'
import { MapBackdrop } from './MapBackdrop'
import { Concierge, type ConciergeMessage } from './Concierge'
import { StepNav, type StepDef } from './StepNav'
import { TextStage } from './stages/TextStage'
import { ImageStage } from './stages/ImageStage'
import { StructureStage } from './stages/StructureStage'
import type { VisualIntent } from './types'
import { ExportStage } from './stages/ExportStage'
import { loadState, saveState, clearState } from './session'

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

export default function App() {
  const [step, setStep] = useState(persisted?.step ?? 1)
  const [viewState, setViewState] = useState(() =>
    persisted?.candidate
      ? { longitude: persisted.candidate.longitude, latitude: persisted.candidate.latitude, zoom: 13 }
      : INITIAL_VIEW,
  )
  const [candidate, setCandidate] = useState<GeoResult | null>(persisted?.candidate ?? null)
  const [story, setStory] = useState<StoryUnit | null>(persisted?.story ?? null)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [imagingPics, setImagingPics] = useState(false)
  const [selectedImage, setSelectedImage] = useState<ImageTarget | null>(null)
  const [regeneratingImage, setRegeneratingImage] = useState<ImageTarget | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportedAt, setExportedAt] = useState<number | null>(null)
  const deckRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<ConciergeMessage[]>(persisted?.messages ?? [])
  const [error, setError] = useState('')

  useEffect(() => {
    saveState({ step, candidate, story, messages })
  }, [step, candidate, story, messages])

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

  async function triggerImageGen(s: StoryUnit) {
    setImagingPics(true)
    pushMessage({
      role: 'agent',
      content: '正在为你拍 7 张图：1 张氛围图 + 6 个 beat。约 30–60 秒。',
      timestamp: now(),
      step: 3,
    })
    try {
      const updated = await generateImages(s)
      setStory(updated)
      pushMessage({
        role: 'agent',
        content: '图都到了。看看哪张要换？（单张重生成 Phase 2 上线）',
        timestamp: now(),
        step: 3,
      })
    } catch (e) {
      pushMessage({
        role: 'agent',
        content: `生图失败：${e instanceof Error ? e.message : 'unknown'}`,
        timestamp: now(),
        step: 3,
      })
    } finally {
      setImagingPics(false)
    }
  }

  useEffect(() => {
    if (step !== 3 || !story || imagingPics) return
    const hasAll = !!story.mood_image_url && story.beats.every(b => !!b.image_url)
    if (hasAll) return
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
      content: `好。让我去走一趟 ${r.city} · ${r.neighborhood}，约 30 秒。`,
      timestamp: now(),
      step: 2,
    })
    try {
      const result = await generate(r.city, r.neighborhood)
      setStory(result)
      pushMessage({
        role: 'agent',
        content: `回来了。我把这片街区的灵魂落在「${result.signature.zh}」上，给了 ${result.beats.length} 个 beat。看看哪里要调整？`,
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
        const r = await forwardGeocode(instruction)
        if (r) {
          setCandidate(r)
          flyTo(r)
          pushMessage({
            role: 'agent',
            content: `找到了：${r.city} · ${r.neighborhood}（${r.display}）。要用这里？`,
            timestamp: now(),
            step: 1,
            action: { label: '用这里', onClick: () => confirmLocation(r) },
          })
        } else {
          pushMessage({
            role: 'agent',
            content: '没找到这个地方。再具体一点？比如「上海 武康路」、「成都 玉林」。',
            timestamp: now(),
            step: 1,
          })
        }
      } catch (e) {
        pushMessage({
          role: 'agent',
          content: `搜索失败：${e instanceof Error ? e.message : 'unknown'}`,
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
        const updated = await edit(story, instruction, messages)
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
        const updated = await edit(story, instruction, messages)
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
      const targetLabel =
        target.type === 'mood' ? 'Mood · Hero' : story.beats[target.beatIndex].title
      setRegeneratingImage(target)
      try {
        const newUrl = await regenerateImage(story, target, instruction, messages)
        setStory(prev => {
          if (!prev) return prev
          if (target.type === 'mood') {
            return { ...prev, mood_image_url: newUrl }
          }
          const beats = prev.beats.map((b, i) =>
            i === target.beatIndex ? { ...b, image_url: newUrl } : b,
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
    if (!story || !deckRef.current) return
    setExporting(true)
    setError('')
    pushMessage({
      role: 'agent',
      content: '正在把每一页渲染成图，再打包成 PPT。约 10 秒。',
      timestamp: now(),
      step: 5,
    })
    try {
      await new Promise(r => setTimeout(r, 100))
      const slideEls = Array.from(
        deckRef.current.querySelectorAll('[data-slide] > *'),
      ) as HTMLElement[]
      const dataUrls: string[] = []
      for (const el of slideEls) {
        const url = await toPng(el, { cacheBust: true, pixelRatio: 1 })
        dataUrls.push(url)
      }
      await exportPpt(story, dataUrls)
      setExportedAt(Date.now())
      pushMessage({
        role: 'agent',
        content: '导出完成。下载好就可以用了。',
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
    setStory({ ...story, beats })
  }

  function setBeatIntent(beatIndex: number, intent: VisualIntent) {
    if (!story) return
    const beats = story.beats.map((b, i) => (i === beatIndex ? { ...b, visual_intent: intent } : b))
    setStory({ ...story, beats })
  }

  function handleJump(target: number) {
    if (target === 1) {
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
      ? '比如「换成黄昏」、「再 cinematic 一些」'
      : step === 4
      ? '比如「把 BUY 放第一个」、「第 3 个 beat 改短」'
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
      ? '↑↓ 调顺序、点风格 chip 选 6 种 slide 排版。或者告诉我「把 BUY 放第一个」之类。'
      : step === 5
      ? '都改完了？点下面的导出 PPT 下载文件。'
      : undefined

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      <StepNav steps={stepDefs} current={step} onJump={handleJump} />

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
            <TextStage
              story={story}
              loading={generating}
              pendingLocation={candidate ? { city: candidate.city, neighborhood: candidate.neighborhood } : null}
              onNext={() => setStep(3)}
            />
          </div>
        )}

        {step === 3 && story && (
          <div className="absolute inset-0 pr-[412px]">
            <ImageStage
              story={story}
              loading={imagingPics}
              selected={selectedImage}
              regenerating={regeneratingImage}
              onSelect={setSelectedImage}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          </div>
        )}

        {step === 4 && story && (
          <div className="absolute inset-0 pr-[412px]">
            <StructureStage
              story={story}
              onReorder={reorderBeat}
              onSetIntent={setBeatIntent}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
            />
          </div>
        )}

        {step === 5 && story && (
          <div className="absolute inset-0 pr-[412px]">
            <ExportStage
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

      {step === 5 && story && <SlideDeck story={story} deckRef={deckRef} />}
    </div>
  )
}
