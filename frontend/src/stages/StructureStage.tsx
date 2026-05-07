import type { StoryUnit, VisualIntent, Beat } from '../types'

const VERB_COLORS: Record<string, string> = {
  DO: '#e86a2f',
  SEE: '#5b8db8',
  HEAR: '#7bb58a',
  TASTE: '#c8a96e',
  DRINK: '#9b7bb5',
  BUY: '#b57b7b',
}

const INTENT_LABELS: Record<VisualIntent, string> = {
  image_dominant: '图主导',
  typography_first: '字主导',
  quiet_balance: '图字均衡',
  dense_detail: '密集细节',
  atmospheric: '氛围沉浸',
  editorial_break: '杂志分栏',
}

const INTENT_ORDER: VisualIntent[] = [
  'image_dominant',
  'typography_first',
  'quiet_balance',
  'dense_detail',
  'atmospheric',
  'editorial_break',
]

type Props = {
  story: StoryUnit
  onReorder: (fromIndex: number, toIndex: number) => void
  onCycleIntent: (beatIndex: number) => void
  onNext: () => void
  onBack: () => void
}

export function StructureStage({ story, onReorder, onCycleIntent, onNext, onBack }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[820px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Field Notes · Step 4
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">调整结构</h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {story.city} · {story.neighborhood}
          </p>
        </div>

        <SlideRow index="00" label="封面" caption={story.signature.zh} />

        <div className="mt-1 mb-1">
          {story.beats.map((beat, i) => (
            <BeatRow
              key={beat.verb}
              index={String(i + 1).padStart(2, '0')}
              beat={beat}
              isFirst={i === 0}
              isLast={i === story.beats.length - 1}
              onUp={() => onReorder(i, i - 1)}
              onDown={() => onReorder(i, i + 1)}
              onCycleIntent={() => onCycleIntent(i)}
            />
          ))}
        </div>

        <SlideRow index="07" label="行动" caption={story.action_cue} dim />

        <div className="mt-12 pt-8 border-t border-[#2a2a28] flex items-center justify-between">
          <button
            onClick={onBack}
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#6b7280] hover:text-[#c8a96e] cursor-pointer"
          >
            ← 改图
          </button>
          <button
            onClick={onNext}
            className="
              font-mono text-[11px] tracking-[0.2em] uppercase
              px-5 py-2.5 rounded
              bg-[#c8a96e] text-[#0f0f0f]
              hover:bg-[#d4ba82] cursor-pointer transition
            "
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
    <div
      className={`
        flex items-center gap-4 py-3 px-4 rounded
        bg-[#1a1a18]/40 backdrop-blur-sm border-l-2 border-[#6b7280]/40
        ${dim ? 'opacity-70' : ''}
      `}
    >
      <span className="font-mono text-[11px] text-[#6b7280] tracking-wider">{index}</span>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280] w-12">
        {label}
      </span>
      <span className="text-[14px] text-[#c8c8c0] truncate flex-1">{caption}</span>
    </div>
  )
}

function BeatRow({
  index,
  beat,
  isFirst,
  isLast,
  onUp,
  onDown,
  onCycleIntent,
}: {
  index: string
  beat: Beat
  isFirst: boolean
  isLast: boolean
  onUp: () => void
  onDown: () => void
  onCycleIntent: () => void
}) {
  const intentLabel = beat.visual_intent ? INTENT_LABELS[beat.visual_intent] : '未定'
  return (
    <div
      className="my-1 flex items-stretch gap-4 py-4 px-4 rounded bg-[#1a1a18]/60 backdrop-blur-sm border-l-2"
      style={{ borderColor: VERB_COLORS[beat.verb] }}
    >
      <div className="flex flex-col items-center gap-1 w-8">
        <span className="font-mono text-[11px] text-[#6b7280] tracking-wider">{index}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
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
          <span className="text-[14px] text-[#f5f5f0] truncate">{beat.title}</span>
        </div>
        <div className="text-[12px] text-[#a8a8a0] line-clamp-1">{beat.copy}</div>
      </div>

      <button
        onClick={onCycleIntent}
        className="
          shrink-0 self-center min-w-[96px] px-3 py-1.5 rounded
          font-mono text-[10px] tracking-[0.15em] uppercase text-center
          text-[#c8a96e]/80 border border-[#c8a96e]/20
          hover:border-[#c8a96e]/60 hover:text-[#c8a96e]
          cursor-pointer transition
        "
        title="切换 slide 风格"
      >
        {intentLabel}
      </button>

      <div className="flex flex-col gap-1 self-center">
        <button
          onClick={onUp}
          disabled={isFirst}
          className="
            w-7 h-7 rounded text-[#6b7280] text-xs
            hover:bg-[#c8a96e]/10 hover:text-[#c8a96e]
            disabled:opacity-20 disabled:cursor-not-allowed
            cursor-pointer transition
          "
          aria-label="上移"
        >
          ↑
        </button>
        <button
          onClick={onDown}
          disabled={isLast}
          className="
            w-7 h-7 rounded text-[#6b7280] text-xs
            hover:bg-[#c8a96e]/10 hover:text-[#c8a96e]
            disabled:opacity-20 disabled:cursor-not-allowed
            cursor-pointer transition
          "
          aria-label="下移"
        >
          ↓
        </button>
      </div>
    </div>
  )
}

export function _cycleIntent(current?: VisualIntent): VisualIntent {
  if (!current) return INTENT_ORDER[0]
  const idx = INTENT_ORDER.indexOf(current)
  return INTENT_ORDER[(idx + 1) % INTENT_ORDER.length]
}
