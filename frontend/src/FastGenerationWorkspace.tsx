import type { IndigoImageJob } from './api'
import type { IndigoBeat, IndigoStoryUnit } from './indigo_types'
import { ImageJobProgress } from './ImageJobProgress'

const IMAGE_FIELDS = [
  'image_url',
  'mood_image_url',
  'col2_image_url',
  'col3_image_url',
] as const

const IMAGE_LABELS = ['场景', '氛围', '设计', '在地']

type Props = {
  story: IndigoStoryUnit
  job: IndigoImageJob | null
  error?: string
  actionBusy: boolean
  onStart: () => void
  onCancel: () => void
  onRetry: () => void
  onRestart: () => void
}

function beatImageCount(beat: IndigoBeat): number {
  return IMAGE_FIELDS.reduce((count, field) => count + (beat[field] ? 1 : 0), 0)
}

function storyImageCount(story: IndigoStoryUnit): number {
  return story.beats.reduce((count, beat) => count + beatImageCount(beat), 0)
}

function StageStatus({
  index,
  label,
  value,
  state,
}: {
  index: string
  label: string
  value: string
  state: 'done' | 'active' | 'pending'
}) {
  return (
    <div className={`border-t pt-3 ${state === 'pending' ? 'border-[#2a2a28]' : 'border-[#c8a96e]'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`font-mono text-[9px] tracking-[0.18em] ${state === 'pending' ? 'text-[#555550]' : 'text-[#c8a96e]'}`}>
          {index}
        </span>
        <span className={`font-mono text-[9px] tabular-nums ${state === 'active' ? 'text-[#f5f5f0]' : 'text-[#777770]'}`}>
          {value}
        </span>
      </div>
      <div className={`mt-2 text-[12px] ${state === 'pending' ? 'text-[#555550]' : 'text-[#d8d8d1]'}`}>
        {label}
      </div>
    </div>
  )
}

export function FastTextGeneration({ city, district }: { city: string; district: string }) {
  return (
    <div className="min-h-full px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-[1040px]">
        <div className="grid gap-10 border-b border-[#2a2a28] pb-10 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] md:items-end">
          <div>
            <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c8a96e]">
              Fast build · Story
            </div>
            <h1 className="mt-4 max-w-[720px] text-[28px] font-light leading-[1.2] text-[#f5f5f0] sm:text-[38px]">
              正在建立「{city} · {district}」的故事骨架
            </h1>
            <p className="mt-4 max-w-[620px] text-[13px] leading-6 text-[#777770]">
              先完成街区叙事、空间触点与设计语言，再进入场景图片生成。
            </p>
          </div>
          <div className="font-mono text-[42px] font-light leading-none text-[#c8a96e] sm:text-[56px]">
            01
            <span className="ml-2 text-[13px] text-[#555550]">/ 03</span>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3 sm:gap-6">
          <StageStatus index="01" label="故事文字" value="生成中" state="active" />
          <StageStatus index="02" label="场景图片" value="等待" state="pending" />
          <StageStatus index="03" label="可编辑 PPTX" value="等待" state="pending" />
        </div>

        <div className="mt-14 grid gap-px overflow-hidden border border-[#242422] bg-[#242422] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="min-h-[132px] bg-[#141412] p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#4f4f4a]">0{index + 1}</span>
                <span className="h-px w-10 bg-[#c8a96e]/45 animate-breathe" />
              </div>
              <div className="mt-7 h-2.5 w-1/2 bg-[#242422] animate-pulse" />
              <div className="mt-3 h-2 w-4/5 bg-[#1f1f1d] animate-pulse" />
              <div className="mt-2 h-2 w-2/3 bg-[#1f1f1d] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FastGenerationWorkspace({
  story,
  job,
  error,
  actionBusy,
  onStart,
  onCancel,
  onRetry,
  onRestart,
}: Props) {
  const completed = job?.completed ?? storyImageCount(story)
  const total = job?.total ?? 24
  const failed = job?.failed ?? 0
  const active = job?.status === 'queued' || job?.status === 'running'
  const statusLabel = active
    ? '图片正在逐张生成'
    : job?.status === 'cancelled'
      ? '图片任务已暂停'
      : failed > 0
        ? '部分图片需要重试'
        : '准备生成场景图片'

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="grid gap-8 border-b border-[#2a2a28] pb-8 md:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)] md:items-end">
          <div>
            <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c8a96e]">
              Fast build · Image set
            </div>
            <h1 className="mt-3 text-[26px] font-light leading-tight text-[#f5f5f0] sm:text-[34px]">
              {story.city} · {story.district}
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-[#777770]">
              {statusLabel}，已完成 {completed} 张，共 6 个空间场景。
            </p>
          </div>
          <div className="flex items-end justify-between gap-5 md:justify-end">
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#777770]">
              Images
            </span>
            <div className="font-mono text-[42px] font-light leading-none text-[#f5f5f0] sm:text-[52px]">
              {String(completed).padStart(2, '0')}
              <span className="ml-2 text-[13px] text-[#555550]">/ {total}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-6">
          <StageStatus index="01" label="故事文字" value="完成" state="done" />
          <StageStatus
            index="02"
            label="场景图片"
            value={`${completed} / ${total}`}
            state={completed === total ? 'done' : 'active'}
          />
          <StageStatus
            index="03"
            label="可编辑 PPTX"
            value={completed === total ? '就绪' : '等待'}
            state={completed === total ? 'done' : 'pending'}
          />
        </div>

        <div className="mt-7">
          {job ? (
            <ImageJobProgress
              job={job}
              error={error}
              actionBusy={actionBusy}
              onCancel={onCancel}
              onRetry={onRetry}
              onRestart={onRestart}
            />
          ) : (
            <section className="flex flex-col items-start justify-between gap-3 border-y border-[#2a2a28] bg-[#141412] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <p className={`text-xs ${error ? 'text-red-400' : 'text-[#8b8b84]'}`}>
                {error || '图片任务等待启动'}
              </p>
              <button
                type="button"
                onClick={onStart}
                disabled={actionBusy}
                className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#c8a96e] disabled:opacity-40"
              >
                开始生成
              </button>
            </section>
          )}
        </div>

        <div className="mt-9 flex items-baseline justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#777770]">
              Scene batches
            </div>
            <h2 className="mt-2 text-[18px] font-light text-[#e8e8e2]">六个空间场景</h2>
          </div>
          <div className="font-mono text-[10px] text-[#555550]">{completed} images ready</div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {story.beats.map((beat, beatIndex) => {
            const beatCompleted = beatImageCount(beat)
            return (
              <article
                key={`${beat.num}-${beat.name_zh}`}
                className="overflow-hidden border border-[#2a2a28] bg-[#151513]"
              >
                <div className="flex items-start justify-between gap-4 border-b border-[#2a2a28] px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#c8a96e]">
                      {beat.num} · {beat.space_zh}
                    </div>
                    <div className="mt-1 truncate text-[14px] text-[#e8e8e2]">{beat.name_zh}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#777770]">
                    {beatCompleted}/4
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-[#2a2a28]">
                  {IMAGE_FIELDS.map((field, imageIndex) => {
                    const image = beat[field]
                    return (
                      <div key={field} className="relative aspect-[16/10] overflow-hidden bg-[#10100f]">
                        {image ? (
                          <img
                            src={image}
                            alt=""
                            className="h-full w-full object-cover animate-fade-rise"
                          />
                        ) : (
                          <div className="absolute inset-0">
                            <div className="absolute inset-0 animate-pulse bg-[#171715]" />
                            <div className="absolute left-3 top-3 font-mono text-[9px] text-[#464641]">
                              {String(beatIndex * 4 + imageIndex + 1).padStart(2, '0')}
                            </div>
                            {active && (
                              <div className="absolute bottom-3 left-3 h-px w-8 bg-[#c8a96e]/55 animate-breathe" />
                            )}
                          </div>
                        )}
                        <span className="absolute bottom-2 right-2 bg-[#0f0f0f]/80 px-1.5 py-1 font-mono text-[8px] tracking-[0.12em] text-[#b7b7b0]">
                          {IMAGE_LABELS[imageIndex]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function FastDeckReady({ story }: { story: IndigoStoryUnit }) {
  return (
    <section className="border-b border-[#2a2a28] bg-[#141412] px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e]">
            Deck ready
          </div>
          <h1 className="mt-2 text-[24px] font-light text-[#f5f5f0]">
            {story.city} · {story.district}
          </h1>
        </div>
        <div className="flex gap-6 font-mono text-[10px] text-[#777770]">
          <span>22 页</span>
          <span>24 张图片</span>
          <span className="text-[#c8a96e]">可导出</span>
        </div>
      </div>
    </section>
  )
}
