import { useEffect, useRef, useState } from 'react'

export type MessageAction = {
  label: string
  onClick: () => void
}

export type ConciergeMessage = {
  role: 'user' | 'agent'
  content: string
  timestamp: string
  step?: number
  action?: MessageAction
}

type Props = {
  messages: ConciergeMessage[]
  onSend: (instruction: string) => void
  thinking: boolean
  disabled?: boolean
  currentStep: number
  stepLabel: string
  placeholder?: string
  emptyHint?: string
}

const DEFAULT_W = 380

export function Concierge({
  messages,
  onSend,
  thinking,
  disabled,
  currentStep,
  stepLabel,
  placeholder,
  emptyHint,
}: Props) {
  const [input, setInput] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const threadRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  function submit() {
    const v = input.trim()
    if (!v || disabled) return
    onSend(v)
    setInput('')
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    let nx = dragStart.current.posX + dx
    let ny = dragStart.current.posY + dy
    // clamp: keep the panel reachable on screen
    const maxLeft = window.innerWidth - DEFAULT_W - 32
    nx = Math.max(-maxLeft, Math.min(0, nx))
    ny = Math.max(-60, Math.min(window.innerHeight - 240, ny))
    setPos({ x: nx, y: ny })
  }
  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
  }

  return (
    <aside
      className="
        fixed right-4 top-20 bottom-4 w-[380px] z-40
        flex flex-col
        bg-[#0f0f0f]/70 backdrop-blur-2xl backdrop-saturate-150
        border border-[#c8a96e]/20 rounded-xl
        shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(245,245,240,0.04)]
      "
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="
          px-6 pt-5 pb-4 border-b border-[#c8a96e]/15
          cursor-grab active:cursor-grabbing select-none
          flex items-center justify-between gap-3
        "
      >
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#6b7280] uppercase">
            Concierge · Step {currentStep} / 5
          </p>
          <h2 className="text-[22px] font-light text-[#f5f5f0] mt-1 leading-tight tracking-tight">
            {stepLabel}
          </h2>
        </div>
        <div className="flex flex-col gap-[3px] opacity-40">
          <span className="block w-4 h-px bg-[#f5f5f0]" />
          <span className="block w-4 h-px bg-[#f5f5f0]" />
          <span className="block w-4 h-px bg-[#f5f5f0]" />
        </div>
      </header>

      <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {messages.length === 0 && !thinking && (
          <p className="text-[13px] text-[#6b7280] leading-relaxed">
            {emptyHint ?? '告诉我你想怎么调整。比如「第三个 beat 改成傍晚」、「整体更含蓄一点」。'}
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className="animate-fade-rise">
            <p
              className={`font-mono text-[10px] tracking-[0.18em] uppercase mb-1.5 ${
                m.role === 'agent' ? 'text-[#c8a96e]' : 'text-[#6b7280]'
              }`}
            >
              {m.role === 'agent' ? 'Indigo' : 'You'} · {m.timestamp}
            </p>
            <p
              className={
                m.role === 'agent'
                  ? 'text-[14px] font-light leading-[1.7] text-[#f5f5f0]/95'
                  : 'text-[14px] leading-relaxed text-[#f5f5f0]/85'
              }
            >
              {m.content}
            </p>
            {m.action && (
              <button
                onClick={m.action.onClick}
                className="
                  mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded
                  bg-[#c8a96e]/15 border border-[#c8a96e]/40
                  text-[#c8a96e] text-[12px] font-mono tracking-[0.15em] uppercase
                  hover:bg-[#c8a96e]/25 hover:border-[#c8a96e]
                  cursor-pointer transition
                "
              >
                {m.action.label} →
              </button>
            )}
          </div>
        ))}

        {thinking && (
          <div className="pt-2">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase mb-2 text-[#c8a96e]">
              Indigo
            </p>
            <div className="h-px w-16 bg-[#c8a96e] animate-breathe" />
          </div>
        )}
      </div>

      <div className="p-3 bg-gradient-to-t from-[#0f0f0f]/80 to-transparent">
        <div
          className="
            flex items-end gap-2 px-3 py-2.5 rounded-lg
            bg-[#0f0f0f]/50 border border-[#f5f5f0]/10
            focus-within:border-[#c8a96e]/60
            focus-within:shadow-[0_0_0_3px_rgba(200,169,110,0.08)]
            transition
          "
        >
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={disabled}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={disabled ? '稍候…' : placeholder ?? 'Ask the concierge…'}
            className="
              flex-1 bg-transparent resize-none outline-none
              text-[14px] leading-[1.5] text-[#f5f5f0]
              placeholder:text-[#6b7280] placeholder:text-[13px]
              max-h-32
              disabled:opacity-50
            "
          />
          <button
            onClick={submit}
            disabled={disabled || !input.trim()}
            className="
              shrink-0 w-8 h-8 rounded-md
              bg-[#c8a96e]/15 border border-[#c8a96e]/40
              text-[#c8a96e] text-sm
              hover:bg-[#c8a96e]/25 hover:border-[#c8a96e]
              disabled:opacity-30 disabled:cursor-not-allowed
              cursor-pointer transition
            "
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  )
}
