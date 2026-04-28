import { useState } from 'react'
import type { StoryUnit } from './types'
import { generate, edit, exportPpt, generateImages } from './api'

const VERB_COLORS: Record<string, string> = {
  DO: '#e86a2f',
  SEE: '#5b8db8',
  HEAR: '#7bb58a',
  TASTE: '#c8a96e',
  DRINK: '#9b7bb5',
  BUY: '#b57b7b',
}

function InputPanel({ onGenerate }: { onGenerate: (city: string, neighborhood: string) => void }) {
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs tracking-widest text-[#6b7280] uppercase">Hotel Indigo</div>
      <h1 className="text-2xl font-light text-[#f5f5f0] leading-tight">
        Neighborhood<br />Storytelling
      </h1>
      <div className="flex flex-col gap-3 mt-4">
        <input
          className="bg-[#1a1a18] border border-[#2a2a28] rounded px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#4b4b48] focus:outline-none focus:border-[#c8a96e] transition-colors"
          placeholder="City"
          value={city}
          onChange={e => setCity(e.target.value)}
        />
        <input
          className="bg-[#1a1a18] border border-[#2a2a28] rounded px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#4b4b48] focus:outline-none focus:border-[#c8a96e] transition-colors"
          placeholder="Neighborhood"
          value={neighborhood}
          onChange={e => setNeighborhood(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && city && neighborhood && onGenerate(city, neighborhood)}
        />
        <button
          onClick={() => city && neighborhood && onGenerate(city, neighborhood)}
          className="mt-2 bg-[#c8a96e] text-[#0f0f0f] text-sm font-medium py-3 px-4 rounded hover:bg-[#d4ba82] transition-colors cursor-pointer"
        >
          Generate
        </button>
      </div>
    </div>
  )
}

function StoryPreview({ story, onEdit, onExport, onGenerateImages, generatingImages }: {
  story: StoryUnit
  onEdit: (instruction: string) => void
  onExport: () => void
  onGenerateImages: () => void
  generatingImages: boolean
}) {
  const [instruction, setInstruction] = useState('')

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
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
          className="flex-1 bg-[#1a1a18] border border-[#2a2a28] rounded px-3 py-2 text-sm text-[#f5f5f0] placeholder-[#4b4b48] focus:outline-none focus:border-[#c8a96e] transition-colors"
          placeholder="Tell me what to change..."
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && instruction) {
              onEdit(instruction)
              setInstruction('')
            }
          }}
        />
        <button
          onClick={() => { if (instruction) { onEdit(instruction); setInstruction('') } }}
          className="bg-[#1a1a18] border border-[#2a2a28] text-[#f5f5f0] text-sm px-4 py-2 rounded hover:border-[#c8a96e] transition-colors cursor-pointer"
        >
          Edit
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onGenerateImages}
          disabled={generatingImages}
          className="flex-1 bg-[#1a1a18] border border-[#2a2a28] text-[#f5f5f0] text-sm py-3 px-4 rounded hover:border-[#c8a96e] transition-colors cursor-pointer disabled:opacity-40"
        >
          {generatingImages ? 'Generating images...' : 'Generate Images'}
        </button>
        <button
          onClick={onExport}
          className="flex-1 bg-[#c8a96e] text-[#0f0f0f] text-sm font-medium py-3 px-4 rounded hover:bg-[#d4ba82] transition-colors cursor-pointer"
        >
          Export PPT
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [story, setStory] = useState<StoryUnit | null>(null)
  const [loading, setLoading] = useState(false)
  const [generatingImages, setGeneratingImages] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate(city: string, neighborhood: string) {
    setLoading(true)
    setError('')
    try {
      setStory(await generate(city, neighborhood))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleEdit(instruction: string) {
    if (!story) return
    setLoading(true)
    setError('')
    try {
      setStory(await edit(story, instruction))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
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
    if (!story) return
    try {
      await exportPpt(story)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex">
      <div className="w-72 shrink-0 border-r border-[#1e1e1c] p-8 flex flex-col justify-between">
        <InputPanel onGenerate={handleGenerate} />
        <div className="text-xs text-[#2a2a28]">Indigo Neighborhood PPT</div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-3 text-[#6b7280] text-sm">
            <div className="w-4 h-4 border border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
            Generating...
          </div>
        )}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {!loading && story && (
          <StoryPreview story={story} onEdit={handleEdit} onExport={handleExport} onGenerateImages={handleGenerateImages} generatingImages={generatingImages} />
        )}
        {!loading && !story && !error && (
          <div className="text-[#2a2a28] text-sm mt-1">Enter a city and neighborhood to begin.</div>
        )}
      </div>
    </div>
  )
}
