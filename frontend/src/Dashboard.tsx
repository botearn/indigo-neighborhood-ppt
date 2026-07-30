import type { AuthUser, GenerationHistoryItem } from './api'

type Props = {
  user: AuthUser
  history: GenerationHistoryItem[]
  historyLoading: boolean
  historyError: string
  openingHistoryId: string | null
  onRefreshHistory: () => void
  onOpenHistory: (item: GenerationHistoryItem) => void
  onStartFast: () => void
  onStartGuided: () => void
  onLogout: () => void
}

function modeLabel(mode: string) {
  if (mode === 'fast') return '一键'
  if (mode === 'guided') return '逐步'
  return mode
}

function formatTime(value: number) {
  return new Date(value * 1000).toLocaleString()
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 11) return '上午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function Dashboard({
  user,
  history,
  historyLoading,
  historyError,
  openingHistoryId,
  onRefreshHistory,
  onOpenHistory,
  onStartFast,
  onStartGuided,
  onLogout,
}: Props) {
  const visibleHistory = history.slice(0, 8)
  const displayName = user.name || user.email.split('@')[0]

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f0f] text-[#f5f5f0]">
      <header className="flex h-16 items-center justify-between gap-4 border-b border-[#1e1e1c] bg-[#0f0f0f]/95 px-6 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b7280]">
            Hotel Indigo
          </span>
          <span className="hidden truncate text-[15px] font-light text-[#f5f5f0]/85 sm:block">
            Neighborhood Storytelling
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="hidden max-w-[220px] truncate text-xs text-[#6b7280] md:inline">{user.email}</span>
          <button
            onClick={onLogout}
            className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b7280] transition hover:text-[#a8a8a0]"
          >
            退出
          </button>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[#1e1e1c] px-6 py-5">
          <div className="mx-auto grid w-full max-w-[1120px] gap-6 md:grid-cols-[1fr_280px] md:items-end">
            <div>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#c8a96e]">
                Personal Dashboard
              </div>
              <h1 className="text-[26px] font-light leading-tight text-[#f5f5f0]">
                {greeting()}，{displayName}
              </h1>
              <p className="mt-2 max-w-[520px] text-[13px] leading-relaxed text-[#6b7280]">
                选择创作路径，或从历史记录继续打开已有 deck。
              </p>
            </div>
            <div className="hidden grid-cols-1 gap-3 md:grid">
              <div className="border-l border-[#c8a96e]/45 pl-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">Account</div>
                <div className="mt-1 truncate text-sm text-[#f5f5f0]/85">{user.email}</div>
              </div>
              <div className="border-l border-[#2d7a7a]/45 pl-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">Saved Decks</div>
                <div className="mt-1 text-sm text-[#f5f5f0]/85">{history.length} 条历史</div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-5">
          <div className="mx-auto w-full max-w-[1120px]">
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-1 font-mono text-[11px] text-[#c8a96e]">01</span>
              <div>
                <h2 className="text-[18px] font-light text-[#f5f5f0]">创作入口</h2>
                <div className="mt-1 text-xs text-[#6b7280]">选择今天要进入的工作流</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <button
                onClick={onStartFast}
                className="group relative overflow-hidden rounded border border-[#4b3d22] bg-[#17140f] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#c8a96e]/65 hover:bg-[#1d1810]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[#c8a96e]" />
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c8a96e]">Fast Lane</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">Auto Deck</div>
                </div>
                <div className="mb-2 text-[20px] font-light text-[#f5f5f0] transition group-hover:text-white">一键生成</div>
                <div className="text-[13px] leading-relaxed text-[#8b8b84]">
                  输入地点，自动完成故事、图片与 PPTX。
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#4b3d22]/70 pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8a96e]/80">Start fast</span>
                  <span className="text-sm text-[#c8a96e]">进入</span>
                </div>
              </button>

              <button
                onClick={onStartGuided}
                className="group relative overflow-hidden rounded border border-[#244747] bg-[#101817] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#2d7a7a]/75 hover:bg-[#121e1d]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[#2d7a7a]" />
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#2d7a7a]">Guided</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">Step by Step</div>
                </div>
                <div className="mb-2 text-[20px] font-light text-[#f5f5f0] transition group-hover:text-white">逐步创作</div>
                <div className="text-[13px] leading-relaxed text-[#8b8b84]">
                  对话选址，逐步确认文字、图片与结构。
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#244747]/80 pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#2d7a7a]/90">Open guide</span>
                  <span className="text-sm text-[#2d7a7a]">进入</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="border-t border-[#1e1e1c] bg-[#111311] px-6 py-6">
          <div className="mx-auto w-full max-w-[1120px]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 font-mono text-[11px] text-[#2d7a7a]">02</span>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b7280]">History</div>
                  <h2 className="mt-1 text-[18px] font-light text-[#f5f5f0]">最近生成</h2>
                </div>
              </div>
              <button
                onClick={onRefreshHistory}
                disabled={historyLoading}
                className="rounded border border-[#2a2a28] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b7280] transition hover:border-[#c8a96e]/40 hover:text-[#a8a8a0] disabled:opacity-40"
              >
                刷新
              </button>
            </div>

            {historyError && (
              <div className="mb-3 rounded border border-red-900/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                {historyError}
              </div>
            )}
            {historyLoading ? (
              <div className="text-sm text-[#6b7280]">正在读取历史…</div>
            ) : visibleHistory.length === 0 ? (
              <div className="border border-dashed border-[#2a2a28] px-4 py-5 text-sm text-[#6b7280]">
                还没有历史记录。生成完成后会自动保存在这里。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {visibleHistory.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onOpenHistory(item)}
                    disabled={openingHistoryId !== null}
                    className="rounded border border-[#2a2a28] bg-[#181a18] p-4 text-left transition hover:border-[#c8a96e]/35 hover:bg-[#1e211f] disabled:cursor-wait disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-[#f5f5f0]">{item.title}</div>
                        <div className="mt-1 truncate text-xs text-[#6b7280]">{item.city} · {item.district}</div>
                      </div>
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-[#c8a96e]/70">
                        {openingHistoryId === item.id ? '打开中' : modeLabel(item.mode)}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-[#6b7280]">{formatTime(item.updated_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
