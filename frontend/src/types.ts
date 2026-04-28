export type SixVerb = 'DO' | 'SEE' | 'HEAR' | 'TASTE' | 'DRINK' | 'BUY'

export type VisualIntent =
  | 'image_dominant'
  | 'typography_first'
  | 'quiet_balance'
  | 'dense_detail'
  | 'atmospheric'
  | 'editorial_break'

export interface SensoryDetail {
  type: string
  description: string
}

export interface Beat {
  title: string
  copy: string
  detail?: string
  verb: SixVerb
  sensory: SensoryDetail[]
  visual_intent?: VisualIntent
  image_url?: string
}

export interface Signature {
  zh: string
  en: string
}

export interface StoryUnit {
  city: string
  neighborhood: string
  signature: Signature
  anchor: string
  hook_line: string
  beats: Beat[]
  action_cue: string
  mood_image_url?: string
}
