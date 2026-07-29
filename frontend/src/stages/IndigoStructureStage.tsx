import type { IndigoStoryUnit } from '../indigo_types'

type Props = {
  story: IndigoStoryUnit
  onReorder: (fromIndex: number, toIndex: number) => void
  onNext: () => void
  onBack: () => void
}

export function IndigoStructureStage({ story, onReorder, onNext, onBack }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Storyline · Step 4
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">调整结构</h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {story.city} · {story.district} · 22 editable PPTX slides
          </p>
        </div>

        <div className="space-y-1.5">
          <SlideRow index="01" label="封面" caption={`Hotel Indigo ${story.hotel_en}`} />
          <SlideRow index="02" label="标题" caption={story.taglines.map(t => t.zh).join(' / ')} />
          <SlideRow index="03" label="概念" caption={story.concept_poem[0] ?? '故事概念'} />
          {story.origins.map((origin, i) => (
            <SlideRow
              key={origin.title}
              index={String(4 + i).padStart(2, '0')}
              label="源起"
              caption={`${origin.title} · ${origin.headline}`}
            />
          ))}
          <SlideRow index="07" label="情绪" caption={story.emotion_headline} />
          <SlideRow index="08" label="总结" caption={story.story_summary} />
          <SlideRow index="09" label="Mapping" caption="6 个 hotel touchpoint 故事流线索引" />
          <SlideRow index="10" label="Flow" caption="故事流线总览" />
        </div>

        <div className="mt-5 mb-1">
          {story.beats.map((beat, i) => (
            <BeatPairRow
              key={`${beat.num}-${beat.name_zh}-${i}`}
              index={String(11 + i * 2).padStart(2, '0')}
              beat={beat}
              isFirst={i === 0}
              isLast={i === story.beats.length - 1}
              onUp={() => onReorder(i, i - 1)}
              onDown={() => onReorder(i, i + 1)}
            />
          ))}
        </div>

        <div className="mt-8 text-[12px] text-[#6b7280] leading-relaxed">
          前 10 页是方法论和故事总览；第 11 页开始每个 beat 固定为「封面页 + moodboard 页」一组。移动 beat 会移动这一组页面。
        </div>

        <div className="mt-12 pt-8 border-t border-[#2a2a28] flex items-center justify-between">
          <button
            onClick={onBack}
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#6b7280] hover:text-[#c8a96e] cursor-pointer"
          >
            ← 改图
          </button>
          <button
            onClick={onNext}
            className="font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2.5 rounded bg-[#c8a96e] text-[#0f0f0f] hover:bg-[#d4ba82] cursor-pointer transition"
          >
            下一步 · 导出
          </button>
        </div>
      </div>
    </div>
  )
}

function SlideRow({
  index,
  label,
  caption,
  dim,
}: {
  index: string
  label: string
  caption: string
  dim?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 py-3 px-4 rounded bg-[#1a1a18]/40 border-l-2 border-[#6b7280]/40 ${dim ? 'opacity-70' : ''}`}>
      <span className="font-mono text-[11px] text-[#6b7280] tracking-wider w-6">{index}</span>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280] w-20">{label}</span>
      <span className="text-[14px] text-[#c8c8c0] truncate flex-1">{caption}</span>
    </div>
  )
}

function BeatPairRow({
  index,
  beat,
  isFirst,
  isLast,
  onUp,
  onDown,
}: {
  index: string
  beat: IndigoStoryUnit['beats'][number]
  isFirst: boolean
  isLast: boolean
  onUp: () => void
  onDown: () => void
}) {
  return (
    <div className="relative my-1 flex items-stretch gap-4 py-4 px-4 rounded bg-[#1a1a18]/60 border-l-2 border-[#c8a96e]/60">
      <div className="flex flex-col items-start gap-1 w-24">
        <span className="font-mono text-[11px] text-[#6b7280] tracking-wider">{index}-{String(Number(index) + 1).padStart(2, '0')}</span>
        <span className="font-mono text-[9px] text-[#c8a96e]/70 tracking-[0.18em] uppercase">Pair</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] tracking-[0.25em] text-[#c8a96e]">{beat.num}</span>
          <span className="text-[14px] text-[#f5f5f0] truncate">{beat.name_zh}</span>
          <span className="text-[12px] text-[#6b7280] truncate">{beat.space_zh}</span>
        </div>
        <div className="text-[12px] text-[#a8a8a0] line-clamp-1">{beat.narrative}</div>
      </div>

      <div className="flex flex-col gap-1 self-center">
        <button
          onClick={onUp}
          disabled={isFirst}
          className="w-7 h-7 rounded text-[#6b7280] text-xs hover:bg-[#c8a96e]/10 hover:text-[#c8a96e] disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition"
          aria-label="上移"
        >
          ↑
        </button>
        <button
          onClick={onDown}
          disabled={isLast}
          className="w-7 h-7 rounded text-[#6b7280] text-xs hover:bg-[#c8a96e]/10 hover:text-[#c8a96e] disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition"
          aria-label="下移"
        >
          ↓
        </button>
      </div>
    </div>
  )
}
