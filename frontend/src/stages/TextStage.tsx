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
  story: StoryUnit | null
  loading: boolean
  pendingLocation: { city: string; neighborhood: string } | null
  onNext: () => void
}

export function TextStage({ story, loading, pendingLocation, onNext }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[800px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Field Notes · Step 2
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">
            {loading ? 'Composing the story…' : '确定文字'}
          </h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {loading
              ? `Walking ${pendingLocation?.city ?? ''} · ${pendingLocation?.neighborhood ?? ''}`
              : `${story?.city ?? ''} · ${story?.neighborhood ?? ''}`}
          </p>
        </div>

        {loading || !story ? <Skeleton /> : <StoryView story={story} />}

        {!loading && story && (
          <div className="mt-12 pt-8 border-t border-[#2a2a28] flex items-center justify-between">
            <p className="italic font-light text-[13px] text-[#6b7280]">
              文字满意了？下一步给图片定调。
            </p>
            <button
              onClick={onNext}
              className="
                font-mono text-[11px] tracking-[0.2em] uppercase
                px-5 py-2.5 rounded
                bg-[#c8a96e] text-[#0f0f0f]
                hover:bg-[#d4ba82] cursor-pointer transition
              "
            >
              下一步 · 图片
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="border-l-2 border-[#c8a96e]/30 pl-4 space-y-3">
        <div className="h-8 w-3/4 bg-[#1a1a18] rounded" />
        <div className="h-3 w-1/3 bg-[#1a1a18] rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-1/4 bg-[#1a1a18] rounded" />
        <div className="h-5 w-full bg-[#1a1a18] rounded" />
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-[#1a1a18]/60 rounded p-5 border-l-2 border-[#2a2a28] space-y-3">
          <div className="h-3 w-1/5 bg-[#2a2a28] rounded" />
          <div className="h-4 w-3/4 bg-[#2a2a28] rounded" />
          <div className="h-3 w-full bg-[#2a2a28] rounded" />
          <div className="h-3 w-5/6 bg-[#2a2a28] rounded" />
        </div>
      ))}
    </div>
  )
}

function StoryView({ story }: { story: StoryUnit }) {
  return (
    <div className="space-y-10 animate-fade-rise">
      <div className="border-l-2 border-[#c8a96e] pl-6 py-2">
        <div className="text-[34px] font-light text-[#f5f5f0] leading-tight">
          {story.signature.zh}
        </div>
        <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-[#c8a96e] mt-2">
          {story.signature.en}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280] mb-1.5">
          {story.anchor}
        </div>
        <div className="text-[20px] text-[#f5f5f0] leading-relaxed">
          {story.hook_line}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 auto-rows-fr">
        {story.beats.map((beat, i) => (
          <div
            key={i}
            className="bg-[#1a1a18]/60 backdrop-blur-sm rounded p-6 border-t-2 flex flex-col"
            style={{ borderColor: VERB_COLORS[beat.verb] }}
          >
            <div className="flex items-center gap-2 mb-3">
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
            <div className="text-[16px] text-[#f5f5f0] mb-2 leading-snug">{beat.title}</div>
            <div className="text-[13px] text-[#c8c8c0] leading-relaxed">{beat.copy}</div>
            {beat.detail && (
              <div className="italic font-light text-[13px] text-[#a8a8a0] mt-2 leading-relaxed">
                {beat.detail}
              </div>
            )}
            {beat.sensory.length > 0 && (
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#6b7280] mt-auto pt-3 border-t border-[#2a2a28]">
                {beat.sensory.map(s => s.description).join('  ·  ')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="italic font-light text-[15px] text-[#c8a96e] border-t border-[#2a2a28] pt-5">
        {story.action_cue}
      </div>
    </div>
  )
}
