export interface IndigoTagline {
  zh: string
  sub: string
}

export interface IndigoOrigin {
  title: string
  headline: string
  body: string
}

export interface IndigoBeat {
  num: string
  name_zh: string
  space_zh: string
  ghost_en: string
  narrative: string
  tagline: string
  mb_ghost_en: string
  mb_concept: string
  mb_concept_sub: string
  mb_col2_title: string
  mb_col2_accent: string
  mb_col2_body: string
  mb_col3_title: string
  mb_col3_accent: string
  mb_col3_body: string
  image_url?: string
  mood_image_url?: string
  col2_image_url?: string
  col3_image_url?: string
}

export interface IndigoStoryUnit {
  city: string
  district: string
  hotel_en: string
  history_id?: string | null
  image_job_id?: string | null
  taglines: IndigoTagline[]
  concept_poem: string[]
  origins: IndigoOrigin[]
  emotion_headline: string
  emotion_poem: string[]
  story_summary: string
  beats: IndigoBeat[]
}
