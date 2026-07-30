type BackButtonProps = {
  onClick: () => void
  disabled?: boolean
  label?: string
}

export function BackButton({ onClick, disabled = false, label = '返回主页' }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="
        group -ml-1 mr-1 flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded
        border border-[#c8a96e]/55 bg-[#211a10] px-3 text-[#e1c27e] shadow-[0_0_0_1px_rgba(200,169,110,0.12)]
        transition hover:border-[#c8a96e]/85 hover:bg-[#2a2114] hover:text-[#f5f5f0]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96e]/50
        disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[#c8a96e]/55 disabled:hover:bg-[#211a10] disabled:hover:text-[#e1c27e]
      "
    >
      <span className="font-mono text-[20px] leading-none transition-transform group-hover:-translate-x-0.5">
        ←
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] sm:hidden">返回</span>
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] sm:inline">返回主页</span>
    </button>
  )
}
