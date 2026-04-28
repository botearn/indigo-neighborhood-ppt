import type { StoryUnit } from './types'

const BASE = '/api'

export async function generate(city: string, neighborhood: string, hotelName?: string): Promise<StoryUnit> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city, neighborhood, hotel_name: hotelName }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function edit(storyUnit: StoryUnit, instruction: string): Promise<StoryUnit> {
  const res = await fetch(`${BASE}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story_unit: storyUnit, instruction }),
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

export async function exportPpt(storyUnit: StoryUnit): Promise<void> {
  const res = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storyUnit),
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
