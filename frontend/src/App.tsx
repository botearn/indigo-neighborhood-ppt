import { useState } from 'react'
import type { StoryUnit } from './types'
import { generate, edit } from './api'
import { MapPicker, forwardGeocode, reverseGeocode, type GeoResult } from './MapPicker'
import { Concierge, type ConciergeMessage } from './Concierge'
import { StepNav, type StepDef } from './StepNav'
import { TextStage } from './stages/TextStage'
import { StubStage } from './stages/StubStage'

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

export default function App() {
  const [step, setStep] = useState(1)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [candidate, setCandidate] = useState<GeoResult | null>(null)
  const [story, setStory] = useState<StoryUnit | null>(null)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [messages, setMessages] = useState<ConciergeMessage[]>([])
  const [error, setError] = useState('')

  function pushMessage(m: ConciergeMessage) {
    setMessages(prev => [...prev, m])
  }

  function flyTo(r: GeoResult) {
    setViewState({ longitude: r.longitude, latitude: r.latitude, zoom: 13 })
  }

  async function confirmLocation(r: GeoResult) {
    setCandidate(null)
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
        const updated = await edit(story, instruction)
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

    pushMessage({
      role: 'agent',
      content: '这一步还在搭建（Phase 2）。先回到「文字」继续？',
      timestamp: now(),
      step,
    })
  }

  function handleJump(target: number) {
    if (target === 1) {
      setStep(1)
      setStory(null)
      setCandidate(null)
      setMessages([])
      setError('')
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
  const conciergeThinking = generating || editing || searching
  const conciergeDisabled = generating

  const stepPlaceholder =
    step === 1
      ? '比如「上海 徐汇」、「成都 玉林」'
      : step === 2
      ? '告诉我要怎么改文字…'
      : 'Ask the concierge…'

  const stepHint =
    step === 1
      ? '告诉我你想做哪里的 PPT。可以直接说「上海 武康路」、「我想要北京胡同的感觉」，或者直接点地图。'
      : undefined

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      <StepNav steps={stepDefs} current={step} onJump={handleJump} />

      <main className="flex-1 relative overflow-hidden">
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

        {step === 3 && (
          <div className="absolute inset-0 pr-[412px]">
            <StubStage
              step={3}
              title="确定图片"
              description="基于你确认的文字，给每个 beat 生成图片，然后让 Concierge 帮你换风格、改 prompt、单张重生成。"
              onBack={() => setStep(2)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="absolute inset-0 pr-[412px]">
            <StubStage
              step={4}
              title="调整结构"
              description="排序、删减、压缩、扩写。告诉 Concierge「压到 8 页」「合并第 2 和第 3 段」就行。"
              onBack={() => setStep(3)}
            />
          </div>
        )}

        {step === 5 && (
          <div className="absolute inset-0 pr-[412px]">
            <StubStage
              step={5}
              title="导出"
              description="确认无误后导出 .pptx。"
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
