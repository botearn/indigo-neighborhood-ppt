export interface IndigoTagline {
  zh: string
  sub: string
}

export interface IndigoOrigin {
  title: string
  headline: string
  body: string
}

export interface IndigoResearchSource {
  title: string
  publisher: string
  url: string
  medium?: string
  collection?: string
  locator?: string
  usage_note: string
}

export interface IndigoResearchMediaPlan {
  medium: string
  purpose: string
  target_materials: string[]
  status: string
}

export interface IndigoResearchLibraryTarget {
  name: string
  kind: string
  search_focus: string
  access_path: string
  status: string
  notes: string
}

export interface IndigoResearchSourceRecord {
  title: string
  source_type: string
  institution: string
  access_path: string
  locator: string
  status: string
  relevance: string
  linked_findings: string[]
  notes: string
}

export interface IndigoResearchAction {
  label: string
  instruction: string
  intent: string
  priority: string
}

export interface IndigoResearchFinding {
  category: string
  title: string
  claim: string
  design_relevance: string
  evidence_mediums?: string[]
  open_questions?: string[]
  source_status: string
  sources: IndigoResearchSource[]
}

export interface IndigoAtlasImageReference {
  title?: string
  caption?: string
  image_url?: string
  source_title?: string
  source_url?: string
  rights_status?: string
  alt_text?: string
  status?: string
  notes?: string
}

export interface IndigoAtlasPlace {
  id: string
  name: string
  zone: string
  place_type?: string
  latitude?: number | null
  longitude?: number | null
  coordinate_status?: string
  summary: string
  historical_note?: string
  cultural_note?: string
  design_translation: string
  source_status: string
  linked_findings?: string[]
  evidence_mediums?: string[]
  sources?: IndigoResearchSource[]
  image_references?: IndigoAtlasImageReference[]
  open_questions?: string[]
}

export interface IndigoAtlasRegion {
  id: string
  name: string
  role: string
  summary: string
  boundary_status?: string
  linked_places?: string[]
  source_status?: string
  sources?: IndigoResearchSource[]
  open_questions?: string[]
}

export interface IndigoAtlasLayer {
  key: string
  label: string
  medium: string
  description: string
  status: string
  linked_places?: string[]
}

export interface IndigoNeighborhoodAtlas {
  title: string
  framing: string
  coordinate_policy: string
  regions: IndigoAtlasRegion[]
  places: IndigoAtlasPlace[]
  layers: IndigoAtlasLayer[]
}

export interface IndigoResearchBrief {
  city: string
  district: string
  hotel_en: string
  summary: string
  source_policy: string
  media_plan?: IndigoResearchMediaPlan[]
  library_targets?: IndigoResearchLibraryTarget[]
  source_library?: IndigoResearchSourceRecord[]
  research_actions?: IndigoResearchAction[]
  atlas?: IndigoNeighborhoodAtlas | null
  questions: string[]
  findings: IndigoResearchFinding[]
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
