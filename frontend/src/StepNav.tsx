export type StepDef = {
  num: number
  label: string
  enabled: boolean
}

type Props = {
  steps: StepDef[]
  current: number
  onJump: (step: number) => void
}

export function StepNav({ steps, current, onJump }: Props) {
  return (
    <header className="h-16 px-6 flex items-center justify-between border-b border-[#1e1e1c] bg-[#0f0f0f]/95 backdrop-blur-sm relative z-30">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">
          Hotel Indigo
        </span>
        <span className="text-[15px] font-light text-[#f5f5f0]/85">Neighborhood Storytelling</span>
      </div>

      <nav className="flex items-center gap-1">
        {steps.map((s, i) => {
          const active = s.num === current
          const done = s.num < current
          return (
            <div key={s.num} className="flex items-center">
              <button
                onClick={() => s.enabled && onJump(s.num)}
                disabled={!s.enabled}
                className={`
                  group flex items-center gap-2 px-3 py-1.5 rounded
                  ${active ? 'bg-[#c8a96e]/10' : ''}
                  ${s.enabled ? 'cursor-pointer hover:bg-[#c8a96e]/5' : 'cursor-not-allowed opacity-50'}
                  transition
                `}
              >
                <span
                  className={`
                    font-mono text-[10px] w-4 h-4 rounded-full flex items-center justify-center
                    ${active ? 'bg-[#c8a96e] text-[#0f0f0f]' : ''}
                    ${done ? 'bg-[#c8a96e]/30 text-[#c8a96e]' : ''}
                    ${!active && !done ? 'border border-[#6b7280]/40 text-[#6b7280]' : ''}
                  `}
                >
                  {done ? '✓' : s.num}
                </span>
                <span
                  className={`
                    font-mono text-[11px] tracking-[0.15em] uppercase
                    ${active ? 'text-[#f5f5f0]' : done ? 'text-[#a8a8a0]' : 'text-[#6b7280]'}
                  `}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && <span className="text-[#2a2a28] mx-0.5">·</span>}
            </div>
          )
        })}
      </nav>
    </header>
  )
}
