import type { StoryUnit } from '../types'

const VERB_COLORS: Record<string, string> = {
  DO: '#e86a2f',
  SEE: '#5b8db8',
  HEAR: '#7bb58a',
  TASTE: '#c8a96e',
  DRINK: '#9b7bb5',
  BUY: '#b57b7b',
}

type Props = {
  story: StoryUnit
  loading: boolean
  onNext: () => void
  onBack: () => void
}

export function ImageStage({ story, loading, onNext, onBack }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-10 py-12">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Field Notes · Step 3
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">
            {loading ? 'Picturing the streets…' : '确定图片'}
          </h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {story.city} · {story.neighborhood}
          </p>
        </div>

        <div className="aspect-video rounded overflow-hidden bg-[#1a1a18] mb-3">
          {story.mood_image_url ? (
            <img
              src={story.mood_image_url}
              alt=""
              className="w-full h-full object-cover animate-fade-rise"
            />
          ) : (
            <Skeleton />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {story.beats.map((beat, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded overflow-hidden bg-[#1a1a18] relative group"
            >
              {beat.image_url ? (
                <img
                  src={beat.image_url}
                  alt=""
                  className="w-full h-full object-cover animate-fade-rise"
                />
              ) : (
                <Skeleton />
              )}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#0f0f0f]/95 via-[#0f0f0f]/60 to-transparent pointer-events-none">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: VERB_COLORS[beat.verb] }}
                  />
                  <span
                    className="font-mono text-[10px] font-medium tracking-[0.25em]"
                    style={{ color: VERB_COLORS[beat.verb] }}
                  >
                    {beat.verb}
                  </span>
                </div>
                <div className="text-[13px] text-[#f5f5f0] mt-1 leading-snug">{beat.title}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-[#2a2a28] flex items-center justify-between">
          <button
            onClick={onBack}
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#6b7280] hover:text-[#c8a96e] cursor-pointer"
          >
            ← 改文字
          </button>
          <button
            onClick={onNext}
            disabled={loading}
            className="
              font-mono text-[11px] tracking-[0.2em] uppercase
              px-5 py-2.5 rounded
              bg-[#c8a96e] text-[#0f0f0f]
              hover:bg-[#d4ba82] cursor-pointer transition
              disabled:opacity-30 disabled:cursor-not-allowed
            "
          >
            下一步 · 结构
          </button>
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full h-full relative overflow-hidden">
      <div className="absolute inset-0 bg-[#1a1a18] animate-pulse" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-px w-12 bg-[#c8a96e] animate-breathe" />
      </div>
    </div>
  )
}
