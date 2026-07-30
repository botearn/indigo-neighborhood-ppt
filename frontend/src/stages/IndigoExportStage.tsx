import type { IndigoStoryUnit } from '../indigo_types'

type Props = {
  story: IndigoStoryUnit
  exporting: boolean
  exportedAt: number | null
  onExport: () => void
  onBack: () => void
}

export function IndigoExportStage({ story, exporting, exportedAt, onExport, onBack }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Storyline · Step 5
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">导出</h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {story.city} · {story.district}
          </p>
        </div>

        <div className="bg-[#1a1a18]/60 rounded p-8 border-l-2 border-[#c8a96e] mb-10">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e] mb-3">
            Hotel Indigo {story.hotel_en}
          </div>
          <div className="text-[28px] font-light text-[#f5f5f0] leading-tight">
            {story.taglines[0]?.zh ?? story.district}
          </div>
          <div className="text-[14px] text-[#a8a8a0] mt-3">{story.story_summary}</div>
        </div>

        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-4">
            22 editable PPTX slides
          </p>
          <ol className="space-y-1.5">
            <SlideItem index="01" label="封面" caption={`Hotel Indigo ${story.hotel_en}`} />
            <SlideItem index="02" label="标题" caption={story.taglines.map(t => t.zh).join(' / ')} />
            <SlideItem index="03" label="概念" caption={story.concept_poem[0] ?? '故事概念'} />
            {story.origins.map((origin, i) => (
              <SlideItem
                key={origin.title}
                index={String(4 + i).padStart(2, '0')}
                label="源起"
                caption={origin.headline}
              />
            ))}
            <SlideItem index="07" label="情绪" caption={story.emotion_headline} />
            <SlideItem index="08" label="总结" caption={story.story_summary} />
            <SlideItem index="09" label="Mapping" caption="空间触点索引" />
            <SlideItem index="10" label="Touchpoints" caption="空间触点总览" />
            {story.beats.flatMap((beat, i) => [
              <SlideItem
                key={`${beat.num}-cover`}
                index={String(11 + i * 2).padStart(2, '0')}
                label="Beat"
                labelColor="#c8a96e"
                caption={`${beat.name_zh} · ${beat.space_zh}`}
              />,
              <SlideItem
                key={`${beat.num}-mood`}
                index={String(12 + i * 2).padStart(2, '0')}
                label="Mood"
                labelColor="#2d7a7a"
                caption={beat.mb_concept}
              />,
            ])}
          </ol>
        </div>

        <button
          onClick={onExport}
          disabled={exporting}
          className="w-full py-4 rounded bg-[#c8a96e] text-[#0f0f0f] font-mono text-[12px] tracking-[0.25em] uppercase hover:bg-[#d4ba82] cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? '生成中…' : '导出可编辑 PPTX'}
        </button>

        {exportedAt && !exporting && (
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#c8a96e]/80 mt-4 text-center animate-fade-rise">
            已下载 · {new Date(exportedAt).toLocaleTimeString()}
          </p>
        )}

        <div className="mt-12 pt-8 border-t border-[#2a2a28]">
          <button
            onClick={onBack}
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#6b7280] hover:text-[#c8a96e] cursor-pointer"
          >
            ← 改结构
          </button>
        </div>
      </div>
    </div>
  )
}

function SlideItem({
  index,
  label,
  labelColor = '#6b7280',
  caption,
}: {
  index: string
  label: string
  labelColor?: string
  caption: string
}) {
  return (
    <li className="flex items-center gap-4 py-2 px-3 rounded hover:bg-[#1a1a18]/40 transition">
      <span className="font-mono text-[11px] text-[#6b7280] tracking-wider w-6">{index}</span>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase w-16" style={{ color: labelColor }}>
        {label}
      </span>
      <span className="text-[13px] text-[#c8c8c0] truncate flex-1">{caption}</span>
    </li>
  )
}
