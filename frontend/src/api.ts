import type { StoryUnit } from './types'
import type { IndigoStoryUnit } from './indigo_types'
import type { ConciergeMessage } from './Concierge'
import type { GeoResult } from './MapPicker'

const BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api`
const AUTH_STORAGE_KEY = 'indigo.auth.token.v1'
const AUTH_EXPIRED_EVENT = 'indigo:auth-expired'

type HistoryMsg = { role: string; content: string; step?: number }

function toHistory(messages?: ConciergeMessage[]): HistoryMsg[] | undefined {
  if (!messages || messages.length === 0) return undefined
  return messages.map(m => ({ role: m.role, content: m.content, step: m.step }))
}

export type LocateResult = {
  reply: string
  candidate: GeoResult | null
}

export type AuthUser = {
  id: string
  email: string
  name?: string | null
  created_at: number
}

export type AuthResponse = {
  user: AuthUser
  token: string
}

export type GenerationHistoryItem = {
  id: string
  mode: 'fast' | 'guided' | string
  city: string
  district: string
  title: string
  created_at: number
  updated_at: number
}

export type GenerationHistoryDetail = GenerationHistoryItem & {
  story: unknown
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid email': '请输入有效邮箱',
  'Password must be at least 8 characters': '密码至少需要 8 位',
  'Email already registered': '这个邮箱已经注册',
  'Invalid email or password': '邮箱或密码不正确',
  'Login required': '请先登录',
  'Session expired': '登录已过期，请重新登录',
  'History item not found': '历史记录不存在',
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_STORAGE_KEY)
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export function onAuthExpired(handler: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}

function emitAuthExpired() {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

function normalizeErrorMessage(message: string): string {
  return ERROR_MESSAGES[message] ?? message
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `请求失败（${res.status}）`
  const text = await res.text()

  if (text) {
    try {
      const data = JSON.parse(text) as { detail?: unknown; message?: unknown }
      const detail = data.detail ?? data.message
      if (typeof detail === 'string') {
        message = normalizeErrorMessage(detail)
      } else if (Array.isArray(detail) && detail.length > 0) {
        message = '请求字段不完整，请检查输入'
      } else {
        message = normalizeErrorMessage(text)
      }
    } catch {
      message = normalizeErrorMessage(text)
    }
  }

  return new ApiError(res.status, message)
}

async function ensureOk(res: Response) {
  if (!res.ok) throw await toApiError(res)
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getAuthToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 401) {
    clearAuthToken()
    emitAuthExpired()
  }
  return res
}

export async function register(email: string, password: string, name?: string): Promise<AuthResponse> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
  await ensureOk(res)
  const data = (await res.json()) as AuthResponse
  setAuthToken(data.token)
  return data
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  await ensureOk(res)
  const data = (await res.json()) as AuthResponse
  setAuthToken(data.token)
  return data
}

export async function logout(): Promise<void> {
  const res = await apiFetch('/auth/logout', { method: 'POST' })
  clearAuthToken()
  if (!res.ok && res.status !== 401) throw await toApiError(res)
}

export async function getCurrentUser(): Promise<AuthUser> {
  const res = await apiFetch('/auth/me')
  await ensureOk(res)
  return res.json()
}

export async function listHistory(): Promise<GenerationHistoryItem[]> {
  const res = await apiFetch('/history')
  await ensureOk(res)
  const data = (await res.json()) as { items: GenerationHistoryItem[] }
  return data.items
}

export async function getHistoryItem(id: string): Promise<GenerationHistoryDetail> {
  const res = await apiFetch(`/history/${encodeURIComponent(id)}`)
  await ensureOk(res)
  return res.json()
}

export async function locate(input: string, history?: ConciergeMessage[]): Promise<LocateResult> {
  const res = await apiFetch('/locate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      conversation_history: toHistory(history),
    }),
  })
  await ensureOk(res)
  return res.json()
}

export async function generate(
  city: string,
  neighborhood: string,
  hotelName?: string,
  history?: ConciergeMessage[],
): Promise<StoryUnit> {
  const res = await apiFetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city,
      neighborhood,
      hotel_name: hotelName,
      conversation_history: toHistory(history),
    }),
  })
  await ensureOk(res)
  return res.json()
}

export async function edit(
  storyUnit: StoryUnit,
  instruction: string,
  history?: ConciergeMessage[],
): Promise<StoryUnit> {
  const res = await apiFetch('/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      story_unit: storyUnit,
      instruction,
      conversation_history: toHistory(history),
    }),
  })
  await ensureOk(res)
  return res.json()
}

export async function generateImages(storyUnit: StoryUnit): Promise<StoryUnit> {
  const res = await apiFetch('/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storyUnit),
  })
  await ensureOk(res)
  return res.json()
}

export type ImageTarget = { type: 'mood' } | { type: 'beat'; beatIndex: number }

export async function regenerateImage(
  storyUnit: StoryUnit,
  target: ImageTarget,
  instruction?: string,
  history?: ConciergeMessage[],
): Promise<string> {
  const res = await apiFetch('/images/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      story_unit: storyUnit,
      target_type: target.type,
      beat_index: target.type === 'beat' ? target.beatIndex : null,
      instruction,
      conversation_history: toHistory(history),
    }),
  })
  await ensureOk(res)
  const data = (await res.json()) as { image_url: string }
  return data.image_url
}

export async function generateIndigo(
  city: string,
  district: string,
  hotelEn?: string,
): Promise<IndigoStoryUnit> {
  const res = await apiFetch('/indigo/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city, district, hotel_en: hotelEn }),
  })
  await ensureOk(res)
  return res.json()
}

export async function exportIndigoPpt(story: IndigoStoryUnit): Promise<void> {
  const res = await apiFetch('/indigo/export-pptx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(story),
  })
  await ensureOk(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${story.district}_${story.city}.pptx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportPpt(storyUnit: StoryUnit, slideDataUrls: string[]): Promise<void> {
  const res = await apiFetch('/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      neighborhood: storyUnit.neighborhood,
      city: storyUnit.city,
      slides: slideDataUrls,
    }),
  })
  await ensureOk(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${storyUnit.neighborhood}_${storyUnit.city}.pptx`
  a.click()
  URL.revokeObjectURL(url)
}
