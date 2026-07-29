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
  const latest = history[0] ?? null
  const fastCount = history.filter(item => item.mode === 'fast').length
  const guidedCount = history.filter(item => item.mode === 'guided').length
  const visibleHistory = history.slice(0, 8)
  const displayName = user.name || user.email.split('@')[0]

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f5f5f0]">
      <header className="min-h-16 px-6 py-4 flex items-center justify-between gap-4 border-b border-[#1e1e1c] bg-[#0f0f0f]/95 backdrop-blur-sm sm:h-16 sm:py-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">Hotel Indigo</span>
          <span className="hidden text-[15px] font-light text-[#f5f5f0]/85 sm:inline">Neighborhood Storytelling</span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden max-w-[260px] truncate text-xs text-[#6b7280] md:inline">{user.email}</span>
          <button
            onClick={onLogout}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#6b7280] hover:text-[#a8a8a0] transition whitespace-nowrap"
          >
            退出
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-6 py-8">
        <section className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-3">
              Personal Dashboard
            </div>
            <h1 className="text-[30px] font-light leading-tight">{greeting()}，{displayName}</h1>
          </div>
          <button
            onClick={onRefreshHistory}
            disabled={historyLoading}
            className="self-start sm:self-auto font-mono text-[10px] tracking-[0.18em] uppercase text-[#6b7280] hover:text-[#a8a8a0] transition disabled:opacity-40"
          >
            刷新历史
          </button>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] gap-5">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-4">
              <button
                onClick={() => latest && onOpenHistory(latest)}
                disabled={!latest || openingHistoryId !== null}
                className="min-h-[210px] text-left bg-[#171715] hover:bg-[#1c1c1a] border border-[#2a2a28] hover:border-[#c8a96e]/45 rounded-lg p-6 transition disabled:cursor-default disabled:hover:bg-[#171715] disabled:hover:border-[#2a2a28]"
              >
                <div className="flex items-center justify-between gap-4 mb-10">
                  <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c8a96e]">Continue</span>
                  {latest && (
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#6b7280]">
                      {openingHistoryId === latest.id ? '打开中' : modeLabel(latest.mode)}
                    </span>
                  )}
                </div>
                {latest ? (
                  <>
                    <div className="text-[25px] font-light text-[#f5f5f0] mb-2">{latest.title}</div>
                    <div className="text-sm text-[#6b7280]">{formatTime(latest.updated_at)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[24px] font-light text-[#f5f5f0] mb-2">还没有 deck</div>
                    <div className="text-sm text-[#6b7280]">新建后会出现在这里。</div>
                  </>
                )}
              </button>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={onStartFast}
                  className="group min-h-[98px] text-left bg-[#1a1a18] hover:bg-[#1f1f1d] border border-[#2a2a28] hover:border-[#c8a96e]/45 rounded-lg p-5 transition"
                >
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#c8a96e] mb-3">New Deck</div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[18px] font-light text-[#f5f5f0]">一键生成</span>
                    <span className="text-[#6b7280] group-hover:text-[#c8a96e] transition">→</span>
                  </div>
                </button>
                <button
                  onClick={onStartGuided}
                  className="group min-h-[98px] text-left bg-[#1a1a18] hover:bg-[#1f1f1d] border border-[#2a2a28] hover:border-[#2d7a7a]/55 rounded-lg p-5 transition"
                >
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#2d7a7a] mb-3">Concierge</div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[18px] font-light text-[#f5f5f0]">逐步创作</span>
                    <span className="text-[#6b7280] group-hover:text-[#2d7a7a] transition">→</span>
                  </div>
                </button>
              </div>
            </div>

            <section className="bg-[#151513] border border-[#242421] rounded-lg">
              <div className="px-5 py-4 border-b border-[#242421] flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280]">Recent Decks</div>
                  <div className="text-sm text-[#f5f5f0]/75 mt-1">最近生成记录</div>
                </div>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#6b7280]">{history.length}</span>
              </div>
              {historyError && (
                <div className="mx-5 mt-4 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-4 py-3">
                  {historyError}
                </div>
              )}
              <div className="p-3">
                {historyLoading ? (
                  <div className="px-3 py-8 text-sm text-[#6b7280]">正在读取历史…</div>
                ) : visibleHistory.length === 0 ? (
                  <div className="px-3 py-8 text-sm text-[#6b7280]">暂无历史记录。</div>
                ) : (
                  <div className="divide-y divide-[#242421]">
                    {visibleHistory.map(item => (
                      <button
                        key={item.id}
                        onClick={() => onOpenHistory(item)}
                        disabled={openingHistoryId !== null}
                        className="w-full text-left px-3 py-3 rounded hover:bg-[#1f1f1d] transition disabled:opacity-50 disabled:cursor-wait"
                      >
                        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_76px_150px] sm:gap-4 sm:items-center">
                          <div className="min-w-0">
                            <div className="text-sm text-[#f5f5f0] truncate">{item.title}</div>
                            <div className="text-xs text-[#6b7280] mt-1 truncate">{item.city} · {item.district}</div>
                          </div>
                          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#c8a96e]/75">
                            {openingHistoryId === item.id ? '打开中' : modeLabel(item.mode)}
                          </span>
                          <span className="text-xs text-[#6b7280] sm:text-right">{formatTime(item.updated_at)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="bg-[#151513] border border-[#242421] rounded-lg p-5">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-5">Account</div>
              <div className="text-[18px] font-light text-[#f5f5f0] truncate">{displayName}</div>
              <div className="text-xs text-[#6b7280] mt-1 truncate">{user.email}</div>
              <div className="mt-5 pt-5 border-t border-[#242421] text-xs text-[#6b7280]">
                加入时间 · {formatTime(user.created_at)}
              </div>
            </section>

            <section className="grid grid-cols-3 gap-2">
              <Stat label="Total" value={history.length} />
              <Stat label="Fast" value={fastCount} />
              <Stat label="Guided" value={guidedCount} />
            </section>

            <section className="bg-[#151513] border border-[#242421] rounded-lg p-5">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#6b7280] mb-4">Backlog</div>
              <div className="space-y-3 text-sm">
                {['重命名 deck', '删除历史', '收藏 / Pin', '草稿状态'].map(item => (
                  <div key={item} className="flex items-center justify-between gap-3">
                    <span className="text-[#a8a8a0]">{item}</span>
                    <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-[#6b7280]">Later</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#151513] border border-[#242421] rounded-lg p-4">
      <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#6b7280] mb-2">{label}</div>
      <div className="text-[24px] font-light text-[#f5f5f0]">{value}</div>
    </div>
  )
}
