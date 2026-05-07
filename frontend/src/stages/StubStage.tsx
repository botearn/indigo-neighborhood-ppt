type Props = {
  step: number
  title: string
  description: string
  onBack: () => void
}

export function StubStage({ step, title, description, onBack }: Props) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-10 py-12">
        <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-2">
          Step {step} · Coming next
        </p>
        <h1 className="text-[34px] font-light text-[#f5f5f0] leading-tight">{title}</h1>
        <p className="italic font-light text-[15px] text-[#6b7280] mt-3 max-w-prose">
          {description}
        </p>
        <div className="mt-10 border border-dashed border-[#2a2a28] rounded p-10 text-center">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">
            Phase 2
          </p>
          <p className="italic font-light text-[14px] text-[#6b7280] mt-2">
            正在搭建中。先去看看上一步。
          </p>
        </div>
        <div className="mt-8">
          <button
            onClick={onBack}
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#c8a96e]/80 hover:text-[#c8a96e] cursor-pointer"
          >
            ← 回到上一步
          </button>
        </div>
      </div>
    </div>
  )
}
