import { useEffect, useRef, useState } from 'react'
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

const INTENT_DESCRIPTIONS: Record<VisualIntent, string> = {
  image_dominant: '画面就是故事，文字只是注脚',
  typography_first: '文字本身是金句，图退到最小',
  quiet_balance: '图文并重，沉静对话',
  dense_detail: '文字密度高，图作为证据嵌入',
  atmospheric: '全幅图 + 大水印，感官沉浸',
  editorial_break: '杂志式上下分栏，节奏切换',
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
  onSetIntent: (beatIndex: number, intent: VisualIntent) => void
  onNext: () => void
  onBack: () => void
}

export function StructureStage({ story, onReorder, onSetIntent, onNext, onBack }: Props) {
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
              onSetIntent={(intent) => onSetIntent(i, intent)}
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
  onSetIntent,
}: {
  index: string
  beat: Beat
  isFirst: boolean
  isLast: boolean
  onUp: () => void
  onDown: () => void
  onSetIntent: (intent: VisualIntent) => void
}) {
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

      <IntentPicker current={beat.visual_intent} onPick={onSetIntent} />

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

function IntentPicker({
  current,
  onPick,
}: {
  current?: VisualIntent
  onPick: (intent: VisualIntent) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const label = current ? INTENT_LABELS[current] : '选风格'

  return (
    <div ref={wrapRef} className="relative shrink-0 self-center">
      <button
        onClick={() => setOpen(o => !o)}
        className="
          min-w-[112px] px-3 py-1.5 rounded
          font-mono text-[10px] tracking-[0.15em] uppercase text-center
          text-[#c8a96e]/85 border border-[#c8a96e]/25
          hover:border-[#c8a96e]/60 hover:text-[#c8a96e]
          cursor-pointer transition
          flex items-center justify-between gap-2
        "
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1">{label}</span>
        <span className="text-[8px] opacity-60">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-full mt-2 w-72 z-50
            bg-[#0f0f0f]/95 backdrop-blur-xl
            border border-[#c8a96e]/25 rounded-lg
            shadow-[0_8px_32px_rgba(0,0,0,0.5)]
            py-2 animate-fade-rise
          "
          role="listbox"
        >
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#6b7280] px-4 pt-1 pb-2">
            Slide style · 6 种
          </p>
          {INTENT_ORDER.map(intent => {
            const selected = current === intent
            return (
              <button
                key={intent}
                onClick={() => {
                  onPick(intent)
                  setOpen(false)
                }}
                className={`
                  w-full text-left px-4 py-2 transition
                  ${selected ? 'bg-[#c8a96e]/10' : 'hover:bg-[#c8a96e]/5'}
                  cursor-pointer
                `}
                role="option"
                aria-selected={selected}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-[#c8a96e]' : 'bg-transparent'}`}
                  />
                  <span
                    className={`font-mono text-[11px] tracking-[0.18em] uppercase ${
                      selected ? 'text-[#c8a96e]' : 'text-[#c8a96e]/70'
                    }`}
                  >
                    {INTENT_LABELS[intent]}
                  </span>
                </div>
                <div className="text-[11px] text-[#a8a8a0] mt-1 ml-3.5 leading-snug">
                  {INTENT_DESCRIPTIONS[intent]}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
