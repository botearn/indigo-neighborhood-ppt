import { useState } from 'react'
import type { StoryUnit } from './types'
import { generate, generateImages } from './api'

type Phase = 'idle' | 'text' | 'image'

type Props = {
  onDone: (story: StoryUnit) => void
  onBack: () => void
}

export function FastLane({ onDone, onBack }: Props) {
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')

  async function run() {
    const c = city.trim()
    const d = district.trim()
    if (!c || !d) return
    setError('')
    setPhase('text')
    try {
      const story = await generate(c, d)
      setPhase('image')
      const withImages = await generateImages(story)
      onDone(withImages)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请重试')
      setPhase('idle')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      <header className="h-16 px-6 flex items-center justify-between border-b border-[#1e1e1c] bg-[#0f0f0f]/95 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">Hotel Indigo</span>
          <span className="text-[15px] font-light text-[#f5f5f0]/85">一键生成</span>
        </div>
        <button
          onClick={onBack}
          disabled={phase !== 'idle'}
          className="font-mono text-[11px] tracking-wider text-[#6b7280] hover:text-[#a8a8a0] disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          ← 返回
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        {phase === 'idle' ? (
          <div className="w-full max-w-[440px] flex flex-col gap-7">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-3">FAST LANE</div>
              <h1 className="text-[26px] font-light text-[#f5f5f0] leading-tight">输入地点，直接出片</h1>
              <p className="text-sm text-[#6b7280] mt-2 leading-relaxed">
                系统自动生成故事与图片，最后只需微调排版
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">城市</label>
                <input
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && run()}
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
                  onKeyDown={e => e.key === 'Enter' && run()}
                  placeholder="新天地"
                  className="bg-[#1a1a18] border border-[#2a2a28] focus:border-[#c8a96e]/50 rounded px-4 py-3 text-[#f5f5f0] text-sm placeholder:text-[#3a3a38] outline-none transition"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-4 py-3">
                {error}
              </div>
            )}

            <button
              onClick={run}
              disabled={!city.trim() || !district.trim()}
              className="bg-[#c8a96e] hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed text-[#0f0f0f] font-mono text-[11px] tracking-[0.25em] uppercase px-6 py-3.5 rounded transition"
            >
              一键生成
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="w-10 h-10 border-2 border-[#c8a96e]/30 border-t-[#c8a96e] rounded-full animate-spin" />
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-2">
                {phase === 'text' ? 'STEP 1 / 2' : 'STEP 2 / 2'}
              </div>
              <div className="text-[#f5f5f0] text-[17px] font-light">
                {phase === 'text'
                  ? `正在为「${city} · ${district}」生成故事…`
                  : '正在生成图片，约 30–60 秒…'}
              </div>
              <div className="text-[#6b7280] text-xs mt-2">
                {phase === 'text' ? '调用语言模型中' : '调用图像模型中'}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
