import type { StoryUnit } from './types'
import type { GeoResult } from './MapPicker'
import type { ConciergeMessage } from './Concierge'

const STORAGE_KEY = 'indigo.session.v1'

export type PersistedState = {
  step: number
  candidate: GeoResult | null
  story: StoryUnit | null
  messages: ConciergeMessage[]
}

type SerializedMessage = Omit<ConciergeMessage, 'action'>

type SerializedState = {
  step: number
  candidate: GeoResult | null
  story: StoryUnit | null
  messages: SerializedMessage[]
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
      story: s.story,
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
