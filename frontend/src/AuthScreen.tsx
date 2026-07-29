import { useState } from 'react'
import type { AuthUser } from './api'
import { login, register } from './api'

type Mode = 'login' | 'register'

export function AuthScreen({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const emailValue = email.trim()
  const canSubmit = emailValue.length > 0 && password.length > 0 && (mode === 'login' || password.length >= 8)

  async function submit() {
    if (!emailValue || !password) return
    if (!emailValue.includes('@')) {
      setError('请输入有效邮箱')
      return
    }
    if (mode === 'register' && password.length < 8) {
      setError('密码至少需要 8 位')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = mode === 'login'
        ? await login(emailValue, password)
        : await register(emailValue, password, name.trim() || undefined)
      onAuthed(result.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#0f0f0f] px-6">
      <div className="w-full max-w-[420px] border border-[#2a2a28] bg-[#171715] rounded-lg p-8">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c8a96e] mb-3">
          Hotel Indigo
        </div>
        <h1 className="text-[26px] font-light text-[#f5f5f0] leading-tight">
          {mode === 'login' ? '登录账号' : '创建账号'}
        </h1>
        <p className="text-sm text-[#6b7280] mt-2 leading-relaxed">
          需要登录后才能生成和导出 PPT。历史生成会保存到你的账号下。
        </p>

        <div className="mt-7 flex flex-col gap-3">
          {mode === 'register' && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">姓名</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-[#0f0f0f] border border-[#2a2a28] focus:border-[#c8a96e]/50 rounded px-4 py-3 text-[#f5f5f0] text-sm outline-none transition"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">邮箱</span>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus
              type="email"
              autoComplete="email"
              className="bg-[#0f0f0f] border border-[#2a2a28] focus:border-[#c8a96e]/50 rounded px-4 py-3 text-[#f5f5f0] text-sm outline-none transition"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">密码</span>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              type="password"
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="bg-[#0f0f0f] border border-[#2a2a28] focus:border-[#c8a96e]/50 rounded px-4 py-3 text-[#f5f5f0] text-sm outline-none transition"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !canSubmit}
          className="mt-6 w-full bg-[#c8a96e] hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed text-[#0f0f0f] font-mono text-[11px] tracking-[0.25em] uppercase px-6 py-3.5 rounded transition"
        >
          {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
        </button>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError('')
          }}
          className="mt-4 w-full text-center text-xs text-[#6b7280] hover:text-[#a8a8a0] transition"
        >
          {mode === 'login' ? '没有账号？创建一个' : '已有账号？去登录'}
        </button>
      </div>
    </div>
  )
}
