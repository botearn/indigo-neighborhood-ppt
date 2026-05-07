import type { StoryUnit } from '../types'
import type { ImageTarget } from '../api'

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
  selected: ImageTarget | null
  regenerating: ImageTarget | null
  onSelect: (target: ImageTarget | null) => void
  onNext: () => void
  onBack: () => void
}

function isSelected(selected: ImageTarget | null, target: ImageTarget): boolean {
  if (!selected) return false
  if (selected.type !== target.type) return false
  if (selected.type === 'mood') return true
  return selected.beatIndex === (target as { type: 'beat'; beatIndex: number }).beatIndex
}

export function ImageStage({
  story,
  loading,
  selected,
  regenerating,
  onSelect,
  onNext,
  onBack,
}: Props) {
  const moodTarget: ImageTarget = { type: 'mood' }
  const moodSelected = isSelected(selected, moodTarget)
  const moodRegen = isSelected(regenerating, moodTarget)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[820px] mx-auto px-12 py-14">
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

        <button
          onClick={() => onSelect(moodSelected ? null : moodTarget)}
          className={`
            block w-full text-left mb-4
            rounded overflow-hidden transition
            ${moodSelected ? 'ring-2 ring-[#c8a96e]' : 'ring-0 hover:ring-1 hover:ring-[#c8a96e]/40'}
          `}
        >
          <div className="aspect-video bg-[#1a1a18]">
            {story.mood_image_url && !moodRegen ? (
              <img
                src={story.mood_image_url}
                alt=""
                className="w-full h-full object-cover animate-fade-rise"
              />
            ) : (
              <Skeleton />
            )}
          </div>
          <div className="px-5 py-4 bg-[#1a1a18]/60 backdrop-blur-sm border-t border-[#c8a96e]/20">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e] mb-1.5">
              {story.signature.en}
            </div>
            <div className="text-[24px] font-light text-[#f5f5f0] leading-tight">
              {story.signature.zh}
            </div>
            <div className="text-[13px] text-[#a8a8a0] mt-2 leading-relaxed">{story.hook_line}</div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-4 auto-rows-fr">
          {story.beats.map((beat, i) => {
            const target: ImageTarget = { type: 'beat', beatIndex: i }
            const sel = isSelected(selected, target)
            const regen = isSelected(regenerating, target)
            const verbColor = VERB_COLORS[beat.verb]
            return (
              <button
                key={beat.verb}
                onClick={() => onSelect(sel ? null : target)}
                className={`
                  flex flex-col text-left
                  rounded overflow-hidden transition
                  ${sel ? 'ring-2 ring-[#c8a96e]' : 'ring-0 hover:ring-1 hover:ring-[#c8a96e]/40'}
                `}
              >
                <div className="aspect-[4/3] bg-[#1a1a18]">
                  {beat.image_url && !regen ? (
                    <img
                      src={beat.image_url}
                      alt=""
                      className="w-full h-full object-cover animate-fade-rise"
                    />
                  ) : (
                    <Skeleton />
                  )}
                </div>
                <div
                  className="flex flex-col flex-1 px-4 py-3.5 bg-[#1a1a18]/60 backdrop-blur-sm border-t-2"
                  style={{ borderColor: verbColor }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: verbColor }}
                    />
                    <span
                      className="font-mono text-[10px] font-medium tracking-[0.25em]"
                      style={{ color: verbColor }}
                    >
                      {beat.verb}
                    </span>
                    <span className="text-[13px] text-[#f5f5f0] truncate">{beat.title}</span>
                  </div>
                  <div className="italic font-light text-[12px] text-[#c8c8c0] leading-relaxed line-clamp-2">
                    “{beat.copy}”
                  </div>
                  {beat.sensory.length > 0 && (
                    <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-[#6b7280] mt-auto pt-2.5">
                      {beat.sensory.slice(0, 3).map(s => s.description).join('  ·  ')}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-8 px-1">
          {selected ? (
            <p className="text-[13px] text-[#c8a96e] italic font-light leading-relaxed">
              已选「{selected.type === 'mood' ? 'Mood · Hero' : story.beats[selected.beatIndex].title}」 — 在右边告诉 Concierge 怎么改这一张。再点一下取消选中。
            </p>
          ) : (
            <p className="text-[13px] text-[#6b7280] leading-relaxed">
              点任意一张图选中，再让 Concierge 改它。
            </p>
          )}
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
