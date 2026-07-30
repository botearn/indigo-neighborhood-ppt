import type { GeoResult } from './MapPicker'
import type { ConciergeMessage } from './Concierge'
import type { IndigoStoryUnit } from './indigo_types'

const STORAGE_KEY = 'indigo.session.v2'
const FAST_STORAGE_KEY = 'indigo.fast-session.v1'

export type PersistedState = {
  step: number
  candidate: GeoResult | null
  story: IndigoStoryUnit | null
  messages: ConciergeMessage[]
}

type SerializedMessage = Omit<ConciergeMessage, 'action'>

type SerializedState = {
  step: number
  candidate: GeoResult | null
  story: IndigoStoryUnit | null
  messages: SerializedMessage[]
}

function compactStory(story: IndigoStoryUnit): IndigoStoryUnit {
  return {
    ...story,
    beats: story.beats.map(beat => ({
      ...beat,
      image_url: beat.image_url?.startsWith('data:') ? undefined : beat.image_url,
      mood_image_url: beat.mood_image_url?.startsWith('data:') ? undefined : beat.mood_image_url,
      col2_image_url: beat.col2_image_url?.startsWith('data:') ? undefined : beat.col2_image_url,
      col3_image_url: beat.col3_image_url?.startsWith('data:') ? undefined : beat.col3_image_url,
    })),
  }
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SerializedState
    return {
      step: parsed.step ?? 1,
      candidate: parsed.candidate ?? null,
      story: parsed.story ?? null,
      messages: (parsed.messages ?? []).map(m => ({ ...m })),
    }
  } catch {
    return null
  }
}

export function saveState(s: PersistedState): void {
  try {
    const serialized: SerializedState = {
      step: s.step,
      candidate: s.candidate,
      story: s.story ? compactStory(s.story) : null,
      messages: s.messages.map(({ action: _action, ...rest }) => rest),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch {
    // localStorage full / disabled — silently degrade
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export type FastRecoveryState = {
  history_id: string
  image_job_id?: string | null
  city: string
  district: string
}

export function loadFastState(): FastRecoveryState | null {
  try {
    const raw = localStorage.getItem(FAST_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FastRecoveryState>
    if (
      typeof parsed.history_id !== 'string' ||
      typeof parsed.city !== 'string' ||
      typeof parsed.district !== 'string'
    ) {
      return null
    }
    return {
      history_id: parsed.history_id,
      image_job_id: parsed.image_job_id,
      city: parsed.city,
      district: parsed.district,
    }
  } catch {
    return null
  }
}

export function saveFastState(story: IndigoStoryUnit): void {
  if (!story.history_id) return
  try {
    const recovery: FastRecoveryState = {
      history_id: story.history_id,
      image_job_id: story.image_job_id,
      city: story.city,
      district: story.district,
    }
    localStorage.setItem(FAST_STORAGE_KEY, JSON.stringify(recovery))
  } catch {
    // History remains the source of recovery when local storage is unavailable.
  }
}

export function clearFastState(): void {
  try {
    localStorage.removeItem(FAST_STORAGE_KEY)
  } catch {
    // ignore
  }
}
