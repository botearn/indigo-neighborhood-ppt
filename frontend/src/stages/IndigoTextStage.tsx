import type { IndigoStoryUnit } from '../indigo_types'

type Props = {
  story: IndigoStoryUnit | null
  loading: boolean
  pendingLocation: { city: string; district: string } | null
  onNext: () => void
}

export function IndigoTextStage({ story, loading, pendingLocation, onNext }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[860px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Storyline · Step 2
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">
            {loading ? 'Composing the Indigo storyline…' : '确定文字'}
          </h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {loading
              ? `${pendingLocation?.city ?? ''} · ${pendingLocation?.district ?? ''}`
              : `${story?.city ?? ''} · ${story?.district ?? ''}`}
          </p>
        </div>

        {loading || !story ? <Skeleton /> : <StoryView story={story} />}

        {!loading && story && (
          <div className="mt-12 pt-8 border-t border-[#2a2a28] flex items-center justify-between">
            <p className="italic font-light text-[13px] text-[#6b7280]">
              文字满意了？下一步生成并检查 22 页所需图片。
            </p>
            <button
              onClick={onNext}
              className="font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2.5 rounded bg-[#c8a96e] text-[#0f0f0f] hover:bg-[#d4ba82] cursor-pointer transition"
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
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="h-28 bg-[#1a1a18] rounded" />)}
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-[#1a1a18]/60 rounded p-5 space-y-3">
          <div className="h-3 w-1/5 bg-[#2a2a28] rounded" />
          <div className="h-4 w-3/4 bg-[#2a2a28] rounded" />
          <div className="h-3 w-full bg-[#2a2a28] rounded" />
        </div>
      ))}
    </div>
  )
}

function StoryView({ story }: { story: IndigoStoryUnit }) {
  return (
    <div className="space-y-10 animate-fade-rise">
      <section>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e] mb-3">
          Tagline Options
        </div>
        <div className="grid grid-cols-3 gap-3">
          {story.taglines.map((tagline, i) => (
            <div key={i} className="bg-[#1a1a18]/60 border border-[#2a2a28] rounded p-5">
              <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#6b7280] mb-3">
                Option {i + 1}
              </div>
              <div className="text-[24px] font-light text-[#f5f5f0] leading-tight">{tagline.zh}</div>
              <div className="text-[13px] text-[#a8a8a0] mt-2 leading-relaxed">{tagline.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#1a1a18]/45 border-l-2 border-[#c8a96e] px-6 py-5 rounded">
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e] mb-3">
          Concept
        </div>
        <div className="space-y-3">
          {story.concept_poem.map((line, i) => (
            <p key={i} className="text-[15px] text-[#f5f5f0]/90 leading-relaxed">{line}</p>
          ))}
        </div>
      </section>

      <section>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-3">
          Origins
        </div>
        <div className="grid grid-cols-3 gap-3">
          {story.origins.map((origin, i) => (
            <div key={i} className="bg-[#1a1a18]/55 rounded p-5">
              <div className="text-[13px] text-[#c8a96e] mb-2">{origin.title}</div>
              <div className="text-[16px] text-[#f5f5f0] leading-snug mb-3">{origin.headline}</div>
              <div className="text-[12px] text-[#a8a8a0] leading-relaxed">{origin.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-3">
          Hotel Touchpoints
        </div>
        <div className="grid grid-cols-2 gap-3">
          {story.beats.map((beat) => (
            <div key={`${beat.num}-${beat.name_zh}`} className="bg-[#1a1a18]/60 rounded p-5 border-t border-[#c8a96e]/30">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#c8a96e] mb-2">
                {beat.num} · {beat.space_zh}
              </div>
              <div className="text-[17px] text-[#f5f5f0] leading-snug">{beat.name_zh}</div>
              <div className="text-[13px] text-[#c8c8c0] mt-2 leading-relaxed">{beat.narrative}</div>
              <div className="text-[12px] text-[#2d7a7a] mt-3">{beat.tagline}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="italic font-light text-[15px] text-[#c8a96e] border-t border-[#2a2a28] pt-5">
        {story.story_summary}
      </section>
    </div>
  )
}
