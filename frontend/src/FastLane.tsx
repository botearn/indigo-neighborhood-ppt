import { useState } from 'react'
import type { IndigoStoryUnit } from './indigo_types'
import { generateIndigo, exportIndigoPpt } from './api'
import { IndigoPreview } from './IndigoSlides'

type Phase = 'idle' | 'generating' | 'preview' | 'exporting'

export function FastLane({ onBack }: { onBack: () => void }) {
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [story, setStory] = useState<IndigoStoryUnit | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate() {
    const c = city.trim(), d = district.trim()
    if (!c || !d) return
    setError('')
    setPhase('generating')
    try {
      const result = await generateIndigo(c, d)
      setStory(result)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请重试')
      setPhase('idle')
    }
  }

  async function handleExport() {
    if (!story) return
    setPhase('exporting')
    try {
      await exportIndigoPpt(story)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    } finally {
      setPhase('preview')
    }
  }

  function handleReset() {
    setStory(null)
    setCity('')
    setDistrict('')
    setPhase('idle')
    setError('')
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-[#1e1e1c] bg-[#0f0f0f]/95 backdrop-blur-sm shrink-0">
        <div className="flex items-baseline gap-3">
          <button
            onClick={onBack}
            disabled={phase === 'generating' || phase === 'exporting'}
            className="font-mono text-[10px] tracking-wider text-[#6b7280] hover:text-[#a8a8a0] disabled:opacity-30 disabled:cursor-not-allowed transition mr-3"
          >
            ←
          </button>
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">Hotel Indigo</span>
          <span className="text-[15px] font-light text-[#f5f5f0]/85">一键生成</span>
          {story && phase === 'preview' && (
            <span className="text-[12px] text-[#6b7280]">· {story.city} {story.district} · 22 页</span>
          )}
        </div>
        {phase === 'preview' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="font-mono text-[11px] tracking-wider text-[#6b7280] hover:text-[#a8a8a0] transition"
            >
              重新生成
            </button>
            <button
              onClick={handleExport}
              className="bg-[#c8a96e] hover:bg-[#d4b87a] text-[#0f0f0f] font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2 rounded transition"
            >
              导出 PPTX
            </button>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">

        {/* Idle: input form */}
        {phase === 'idle' && (
          <div className="flex items-center justify-center min-h-full px-6 py-12">
            <div className="w-full max-w-[440px] flex flex-col gap-7">
              <div>
                <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-3">FAST LANE</div>
                <h1 className="text-[26px] font-light text-[#f5f5f0] leading-tight">输入地点，直接出片</h1>
                <p className="text-sm text-[#6b7280] mt-2 leading-relaxed">
                  自动生成 22 页 Hotel Indigo 故事线 PPT，约 30 秒
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
          </div>
        )}

        {/* Generating */}
        {(phase === 'generating' || phase === 'exporting') && (
          <div className="flex items-center justify-center min-h-full">
            <div className="flex flex-col items-center gap-8 text-center">
              <div className="w-10 h-10 border-2 border-[#c8a96e]/30 border-t-[#c8a96e] rounded-full animate-spin" />
              <div>
                <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-2">
                  {phase === 'generating' ? '生成中' : '导出中'}
                </div>
                <div className="text-[#f5f5f0] text-[17px] font-light">
                  {phase === 'generating'
                    ? `正在为「${city} · ${district}」生成 22 页故事线…`
                    : '正在截图并打包 PPTX…'}
                </div>
                <div className="text-[#6b7280] text-xs mt-2">
                  {phase === 'generating' ? 'Taglines · Origins · 6 Beats · Moodboards' : '22 页 · 约 20 秒'}
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
            <IndigoPreview story={story} />
          </>
        )}
      </main>

    </div>
  )
}
