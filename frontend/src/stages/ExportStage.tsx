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
  exporting: boolean
  exportedAt: number | null
  onExport: () => void
  onBack: () => void
}

export function ExportStage({ story, exporting, exportedAt, onExport, onBack }: Props) {
  const totalSlides = 2 + story.beats.length + 2 // mood + hook + beats + action + closing

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Field Notes · Step 5
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">导出</h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {story.city} · {story.neighborhood}
          </p>
        </div>

        <div className="bg-[#1a1a18]/60 backdrop-blur-sm rounded p-8 border-l-2 border-[#c8a96e] mb-10">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e] mb-3">
            {story.signature.en}
          </div>
          <div className="text-[28px] font-light text-[#f5f5f0] leading-tight">
            {story.signature.zh}
          </div>
          <div className="text-[14px] text-[#a8a8a0] mt-3">{story.hook_line}</div>
        </div>

        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-4">
            {totalSlides} slides
          </p>
          <ol className="space-y-1.5">
            <SlideItem index="01" label="封面" caption={story.signature.zh} />
            <SlideItem index="02" label="钩子" caption={story.hook_line} />
            {story.beats.map((beat, i) => (
              <SlideItem
                key={beat.verb}
                index={String(i + 3).padStart(2, '0')}
                label={beat.verb}
                labelColor={VERB_COLORS[beat.verb]}
                caption={beat.title}
              />
            ))}
            <SlideItem
              index={String(story.beats.length + 3).padStart(2, '0')}
              label="行动"
              caption={story.action_cue}
            />
            <SlideItem
              index={String(story.beats.length + 4).padStart(2, '0')}
              label="收尾"
              caption={`${story.city} · ${story.neighborhood}`}
            />
          </ol>
        </div>

        <button
          onClick={onExport}
          disabled={exporting}
          className="
            w-full py-4 rounded
            bg-[#c8a96e] text-[#0f0f0f]
            font-mono text-[12px] tracking-[0.25em] uppercase
            hover:bg-[#d4ba82] cursor-pointer transition
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {exporting ? '生成中…' : '导出 PPT'}
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
      <span
        className="font-mono text-[10px] tracking-[0.2em] uppercase w-16"
        style={{ color: labelColor }}
      >
        {label}
      </span>
      <span className="text-[13px] text-[#c8c8c0] truncate flex-1">{caption}</span>
    </li>
  )
}
