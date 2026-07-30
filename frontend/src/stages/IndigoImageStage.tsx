import type { IndigoStoryUnit } from '../indigo_types'
import type { IndigoImageField, IndigoImageJob, IndigoImageTarget } from '../api'
import { ImageJobProgress } from '../ImageJobProgress'

const IMAGE_FIELDS: { field: IndigoImageField; label: string }[] = [
  { field: 'image_url', label: '主图' },
  { field: 'mood_image_url', label: 'Mood' },
  { field: 'col2_image_url', label: '设计灵感' },
  { field: 'col3_image_url', label: '空间细节' },
]

type Props = {
  story: IndigoStoryUnit
  loading: boolean
  job: IndigoImageJob | null
  jobError: string
  jobActionBusy: boolean
  selected: IndigoImageTarget | null
  regenerating: IndigoImageTarget | null
  onSelect: (target: IndigoImageTarget | null) => void
  onStart: () => void
  onCancel: () => void
  onRetry: () => void
  onRestart: () => void
  onNext: () => void
  onBack: () => void
}

function isSameTarget(a: IndigoImageTarget | null, b: IndigoImageTarget): boolean {
  return !!a && a.beatIndex === b.beatIndex && a.field === b.field
}

export function indigoImageTargetLabel(story: IndigoStoryUnit, target: IndigoImageTarget): string {
  const beat = story.beats[target.beatIndex]
  const label = IMAGE_FIELDS.find(item => item.field === target.field)?.label ?? target.field
  return `${beat?.num ?? ''} ${beat?.name_zh ?? ''} · ${label}`.trim()
}

export function IndigoImageStage({
  story,
  loading,
  job,
  jobError,
  jobActionBusy,
  selected,
  regenerating,
  onSelect,
  onStart,
  onCancel,
  onRetry,
  onRestart,
  onNext,
  onBack,
}: Props) {
  const hasImages = story.beats.some(beat => IMAGE_FIELDS.some(({ field }) => !!beat[field]))
  const hasAllImages = story.beats.every(
    beat => IMAGE_FIELDS.every(({ field }) => !!beat[field]),
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-12 py-14">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
            Storyline · Step 3
          </p>
          <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">
            {loading ? 'Generating Indigo image set…' : '确定图片'}
          </h1>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            {story.city} · {story.district} · 6 beats × 4 images
          </p>
        </div>

        {job ? (
          <div className="mb-8">
            <ImageJobProgress
              job={job}
              error={jobError}
              actionBusy={jobActionBusy}
              onCancel={onCancel}
              onRetry={onRetry}
              onRestart={onRestart}
            />
          </div>
        ) : !hasAllImages ? (
          <section className="mb-8 border-y border-[#2a2a28] bg-[#141412] px-5 py-4 flex items-center justify-between gap-5">
            <p className={`text-xs ${jobError ? 'text-red-400' : 'text-[#8b8b84]'}`}>
              {jobError || '图片任务尚未开始'}
            </p>
            <button
              type="button"
              onClick={onStart}
              disabled={jobActionBusy}
              className="shrink-0 font-mono text-[10px] tracking-[0.16em] uppercase text-[#c8a96e] disabled:opacity-40"
            >
              开始生成
            </button>
          </section>
        ) : null}

        {loading && !hasImages ? (
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {story.beats.map((beat, beatIndex) => (
              <section key={`${beat.num}-${beat.name_zh}`} className="bg-[#1a1a18]/60 rounded border border-[#2a2a28] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#2a2a28]">
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#c8a96e]">
                    {beat.num} · {beat.space_zh}
                  </div>
                  <div className="text-[15px] text-[#f5f5f0] mt-1">{beat.name_zh}</div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-[#2a2a28]">
                  {IMAGE_FIELDS.map(({ field, label }) => {
                    const target = { beatIndex, field }
                    const selectedNow = isSameTarget(selected, target)
                    const regeneratingNow = isSameTarget(regenerating, target)
                    const image = beat[field]
                    return (
                      <button
                        key={field}
                        onClick={() => onSelect(selectedNow ? null : target)}
                        className={`relative aspect-[4/3] bg-[#10100f] text-left overflow-hidden ${selectedNow ? 'ring-2 ring-[#c8a96e] z-10' : ''}`}
                      >
                        {image && !regeneratingNow ? (
                          <img src={image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Skeleton />
                        )}
                        <div className="absolute left-2 bottom-2 px-2 py-1 rounded bg-[#0f0f0f]/70 text-[10px] text-[#f5f5f0]">
                          {label}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-8 px-1">
          {selected ? (
            <p className="text-[13px] text-[#c8a96e] italic font-light leading-relaxed">
              已选「{indigoImageTargetLabel(story, selected)}」，在右边告诉 Concierge 怎么改这一张。再点一下取消选中。
            </p>
          ) : (
            <p className="text-[13px] text-[#6b7280] leading-relaxed">
              点任意一张图选中，再让 Concierge 改它。逐步和一键现在使用同一套图片字段。
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
            disabled={loading || !hasAllImages}
            className="font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2.5 rounded bg-[#c8a96e] text-[#0f0f0f] hover:bg-[#d4ba82] cursor-pointer transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            下一步 · 结构
          </button>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-[#1a1a18]/60 rounded border border-[#2a2a28] overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-[#2a2a28] space-y-2">
        <div className="h-3 w-1/3 bg-[#2a2a28] rounded" />
        <div className="h-4 w-1/2 bg-[#2a2a28] rounded" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#2a2a28]">
        {[0, 1, 2, 3].map(i => <div key={i} className="aspect-[4/3] bg-[#10100f]" />)}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full h-full relative overflow-hidden">
      <div className="absolute inset-0 bg-[#10100f] animate-pulse" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-px w-10 bg-[#c8a96e] animate-breathe" />
      </div>
    </div>
  )
}
