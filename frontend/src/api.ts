import type { StoryUnit } from './types'
import type { ConciergeMessage } from './Concierge'

const BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api`

type HistoryMsg = { role: string; content: string; step?: number }

function toHistory(messages?: ConciergeMessage[]): HistoryMsg[] | undefined {
  if (!messages || messages.length === 0) return undefined
  return messages.map(m => ({ role: m.role, content: m.content, step: m.step }))
}

export async function generate(
  city: string,
  neighborhood: string,
  hotelName?: string,
  history?: ConciergeMessage[],
): Promise<StoryUnit> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city,
      neighborhood,
      hotel_name: hotelName,
      conversation_history: toHistory(history),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function edit(
  storyUnit: StoryUnit,
  instruction: string,
  history?: ConciergeMessage[],
): Promise<StoryUnit> {
  const res = await fetch(`${BASE}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      story_unit: storyUnit,
      instruction,
      conversation_history: toHistory(history),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function generateImages(storyUnit: StoryUnit): Promise<StoryUnit> {
  const res = await fetch(`${BASE}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storyUnit),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function exportPpt(storyUnit: StoryUnit, slideDataUrls: string[]): Promise<void> {
  const res = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      neighborhood: storyUnit.neighborhood,
      city: storyUnit.city,
      slides: slideDataUrls,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${storyUnit.neighborhood}_${storyUnit.city}.pptx`
  a.click()
  URL.revokeObjectURL(url)
}
