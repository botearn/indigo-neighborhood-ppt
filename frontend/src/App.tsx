import { useState, useRef } from 'react'
import { toPng } from 'html-to-image'
import type { StoryUnit } from './types'
import { generate, edit, exportPpt, generateImages } from './api'
import { SlideDeck } from './Slides'
import { MapPicker } from './MapPicker'

const VERB_COLORS: Record<string, string> = {
  DO: '#e86a2f',
  SEE: '#5b8db8',
  HEAR: '#7bb58a',
  TASTE: '#c8a96e',
  DRINK: '#9b7bb5',
  BUY: '#b57b7b',
}

type Step = 'pick' | 'generating' | 'preview'

function GeneratingView({ city, neighborhood, onCancel }: { city: string; neighborhood: string; onCancel: () => void }) {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin mb-6" />
        <div className="text-xs tracking-widest text-[#6b7280] uppercase mb-2">Generating</div>
        <div className="text-3xl font-light text-[#f5f5f0] mb-1">{city} · {neighborhood}</div>
        <div className="text-sm text-[#6b7280] mt-4">挖掘街区故事中，约 30 秒...</div>
        <button
          onClick={onCancel}
          className="mt-8 text-xs text-[#6b7280] hover:text-[#c8a96e] underline cursor-pointer"
        >
          取消
        </button>
      </div>
    </div>
  )
}

function StoryPreview({ story, onEdit, onExport, onGenerateImages, onBack, generatingImages, exporting, editing }: {
  story: StoryUnit
  onEdit: (instruction: string) => void
  onExport: () => void
  onGenerateImages: () => void
  onBack: () => void
  generatingImages: boolean
  exporting: boolean
  editing: boolean
}) {
  const [instruction, setInstruction] = useState('')

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-[#6b7280] hover:text-[#c8a96e] cursor-pointer"
        >
          ← 重新选择街区
        </button>
        <div className="text-xs text-[#6b7280]">{story.city} · {story.neighborhood}</div>
      </div>

      {story.mood_image_url && (
        <div className="w-full h-48 rounded overflow-hidden">
          <img src={story.mood_image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="border-l-2 border-[#c8a96e] pl-4">
        <div className="text-3xl font-light text-[#f5f5f0]">{story.signature.zh}</div>
        <div className="text-sm tracking-widest text-[#c8a96e] uppercase mt-1">{story.signature.en}</div>
      </div>

      <div>
        <div className="text-xs text-[#6b7280] mb-1">{story.anchor}</div>
        <div className="text-lg text-[#f5f5f0]">{story.hook_line}</div>
      </div>

      <div className="flex flex-col gap-3">
        {story.beats.map((beat, i) => (
          <div key={i} className="bg-[#1a1a18] rounded p-4 border-l-2" style={{ borderColor: VERB_COLORS[beat.verb] }}>
            {beat.image_url && (
              <div className="w-full h-32 rounded overflow-hidden mb-3">
                <img src={beat.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold" style={{ color: VERB_COLORS[beat.verb] }}>
                {beat.verb}
              </span>
              <span className="text-sm font-medium text-[#f5f5f0]">{beat.title}</span>
            </div>
            <div className="text-sm text-[#c8c8c0]">{beat.copy}</div>
            {beat.detail && (
              <div className="text-sm text-[#a8a8a0] mt-2 leading-relaxed">{beat.detail}</div>
            )}
            <div className="text-xs text-[#6b7280] mt-2">
              {beat.sensory.map(s => s.description).join('  ·  ')}
            </div>
          </div>
        ))}
      </div>

      <div className="text-sm text-[#c8a96e] border-t border-[#2a2a28] pt-4">
        {story.action_cue}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 bg-[#1a1a18] border border-[#2a2a28] rounded px-3 py-2 text-sm text-[#f5f5f0] placeholder-[#4b4b48] focus:outline-none focus:border-[#c8a96e]"
          placeholder="告诉我要改什么..."
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          disabled={editing}
          onKeyDown={e => {
            if (e.key === 'Enter' && instruction) {
              onEdit(instruction)
              setInstruction('')
            }
          }}
        />
        <button
          onClick={() => { if (instruction) { onEdit(instruction); setInstruction('') } }}
          disabled={editing}
          className="bg-[#1a1a18] border border-[#2a2a28] text-[#f5f5f0] text-sm px-4 py-2 rounded hover:border-[#c8a96e] cursor-pointer disabled:opacity-40"
        >
          {editing ? '...' : '调整'}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onGenerateImages}
          disabled={generatingImages}
          className="flex-1 bg-[#1a1a18] border border-[#2a2a28] text-[#f5f5f0] text-sm py-3 px-4 rounded hover:border-[#c8a96e] cursor-pointer disabled:opacity-40"
        >
          {generatingImages ? '生成图片中...' : '生成图片'}
        </button>
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex-1 bg-[#c8a96e] text-[#0f0f0f] text-sm font-medium py-3 px-4 rounded hover:bg-[#d4ba82] cursor-pointer disabled:opacity-40"
        >
          {exporting ? '导出中...' : '导出 PPT'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState<Step>('pick')
  const [pendingLocation, setPendingLocation] = useState<{ city: string; neighborhood: string } | null>(null)
  const [story, setStory] = useState<StoryUnit | null>(null)
  const [editing, setEditing] = useState(false)
  const [generatingImages, setGeneratingImages] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const deckRef = useRef<HTMLDivElement | null>(null)

  async function handleConfirmLocation(city: string, neighborhood: string) {
    setPendingLocation({ city, neighborhood })
    setStep('generating')
    setError('')
    try {
      const result = await generate(city, neighborhood)
      setStory(result)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('pick')
    }
  }

  async function handleEdit(instruction: string) {
    if (!story) return
    setEditing(true)
    setError('')
    try {
      setStory(await edit(story, instruction))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setEditing(false)
    }
  }

  async function handleGenerateImages() {
    if (!story) return
    setGeneratingImages(true)
    setError('')
    try {
      setStory(await generateImages(story))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image generation failed')
    } finally {
      setGeneratingImages(false)
    }
  }

  async function handleExport() {
    if (!story || !deckRef.current) return
    setExporting(true)
    setError('')
    try {
      await new Promise(r => setTimeout(r, 100))
      const slideEls = Array.from(deckRef.current.querySelectorAll('[data-slide] > *')) as HTMLElement[]
      const dataUrls: string[] = []
      for (const el of slideEls) {
        const url = await toPng(el, { cacheBust: true, pixelRatio: 1 })
        dataUrls.push(url)
      }
      await exportPpt(story, dataUrls)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  function handleBackToPick() {
    setStep('pick')
    setStory(null)
    setPendingLocation(null)
    setError('')
  }

  if (step === 'pick') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <header className="px-8 py-5 border-b border-[#1e1e1c] flex items-center justify-between">
          <div>
            <div className="text-xs tracking-widest text-[#6b7280] uppercase">Hotel Indigo</div>
            <div className="text-base font-light text-[#f5f5f0] mt-0.5">Neighborhood Storytelling</div>
          </div>
          <div className="text-xs text-[#6b7280]">Step 1 / 3 · 选择街区</div>
        </header>
        <div className="flex-1 relative">
          <MapPicker onConfirm={handleConfirmLocation} />
        </div>
        {error && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-900/80 text-red-200 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}
      </div>
    )
  }

  if (step === 'generating' && pendingLocation) {
    return <GeneratingView city={pendingLocation.city} neighborhood={pendingLocation.neighborhood} onCancel={handleBackToPick} />
  }

  if (step === 'preview' && story) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <header className="px-8 py-5 border-b border-[#1e1e1c] flex items-center justify-between">
          <div>
            <div className="text-xs tracking-widest text-[#6b7280] uppercase">Hotel Indigo</div>
            <div className="text-base font-light text-[#f5f5f0] mt-0.5">Neighborhood Storytelling</div>
          </div>
          <div className="text-xs text-[#6b7280]">Step 3 / 3 · 预览与导出</div>
        </header>
        <div className="flex-1 p-8 overflow-y-auto">
          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
          <StoryPreview
            story={story}
            onEdit={handleEdit}
            onExport={handleExport}
            onGenerateImages={handleGenerateImages}
            onBack={handleBackToPick}
            generatingImages={generatingImages}
            exporting={exporting}
            editing={editing}
          />
        </div>
        <SlideDeck story={story} deckRef={deckRef} />
      </div>
    )
  }

  return null
}
