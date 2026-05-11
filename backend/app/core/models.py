from pydantic import BaseModel, Field, field_validator
from enum import Enum
from typing import Optional


class SixVerb(str, Enum):
    DO = "DO"
    SEE = "SEE"
    HEAR = "HEAR"
    TASTE = "TASTE"
    DRINK = "DRINK"
    BUY = "BUY"


ALL_VERBS = {v.value for v in SixVerb}


class VisualIntent(str, Enum):
    IMAGE_DOMINANT = "image_dominant"      # 画面就是故事本身,文字只是注脚
    TYPOGRAPHY_FIRST = "typography_first"  # 文字本身就是一击,图退到最小或没有
    QUIET_BALANCE = "quiet_balance"        # 文字图片并重,沉静对话
    DENSE_DETAIL = "dense_detail"          # 文字密度高,图作为"证据"嵌入
    ATMOSPHERIC = "atmospheric"            # 全幅图 + 重氛围,大水印,感官沉浸
    EDITORIAL_BREAK = "editorial_break"    # 杂志式上下分栏,节奏切换


class Signature(BaseModel):
    zh: str = Field(description="≤8字，禁用：文化/风情/韵味/之都/名片/地标/代表")
    en: str = Field(description="≤6词")


class SensoryDetail(BaseModel):
    type: str   # sound / smell / light / texture
    description: str


class Beat(BaseModel):
    title: str
    copy: str
    detail: str = ""
    verb: SixVerb
    sensory: list[SensoryDetail]
    visual_intent: Optional[VisualIntent] = None
    image_url: Optional[str] = None


class StoryUnit(BaseModel):
    city: str
    neighborhood: str
    signature: Signature
    anchor: str
    hook_line: str
    beats: list[Beat] = Field(min_length=6, max_length=6)
    action_cue: str
    mood_image_url: Optional[str] = None

    @field_validator("beats")
    @classmethod
    def _all_six_verbs(cls, beats: list[Beat]) -> list[Beat]:
        verbs = [b.verb.value for b in beats]
        missing = ALL_VERBS - set(verbs)
        if missing:
            raise ValueError(f"missing verbs: {sorted(missing)}; need one beat per verb {sorted(ALL_VERBS)}")
        if len(verbs) != len(set(verbs)):
            dupes = sorted({v for v in verbs if verbs.count(v) > 1})
            raise ValueError(f"duplicate verbs: {dupes}; each verb must appear exactly once")
        return beats

    @field_validator("beats")
    @classmethod
    def _intent_variety(cls, beats: list[Beat]) -> list[Beat]:
        intents = [b.visual_intent for b in beats if b.visual_intent is not None]
        if not intents:
            return beats  # LLM omitted entirely; backend will infer
        if len(set(intents)) < 3:
            raise ValueError(
                f"visual_intent lacks variety: only {sorted({i.value for i in intents})} used across 6 beats; "
                "need at least 3 distinct intents to give the deck rhythm"
            )
        return beats


class ConversationMessage(BaseModel):
    role: str  # 'user' | 'agent'
    content: str
    step: Optional[int] = None


class GenerateRequest(BaseModel):
    city: str
    neighborhood: str
    hotel_name: Optional[str] = None
    conversation_history: Optional[list[ConversationMessage]] = None


class EditRequest(BaseModel):
    story_unit: StoryUnit
    instruction: str
    conversation_history: Optional[list[ConversationMessage]] = None


class SingleImageRequest(BaseModel):
    story_unit: StoryUnit
    target_type: str  # 'mood' | 'beat'
    beat_index: Optional[int] = None
    instruction: Optional[str] = None
    conversation_history: Optional[list[ConversationMessage]] = None


class SingleImageResponse(BaseModel):
    image_url: str


class LocationCandidate(BaseModel):
    city: str
    neighborhood: str
    display: str
    longitude: float
    latitude: float


class LocateRequest(BaseModel):
    input: str
    conversation_history: Optional[list[ConversationMessage]] = None


class LocateResponse(BaseModel):
    reply: str
    candidate: Optional[LocationCandidate] = None


# ── Hotel Indigo 22-slide methodology ──────────────────────────────────────

class IndigoTagline(BaseModel):
    zh: str    # e.g. "弄里·申韵"
    sub: str   # e.g. "石库门里的上海精气神"


class IndigoOrigin(BaseModel):
    title: str     # e.g. "邻间背景与生活风貌"
    headline: str  # strong opening sentence
    body: str      # ~120 chars


class IndigoBeat(BaseModel):
    num: str           # "01"–"06"
    name_zh: str       # "石·门·迎·耀"  (use · as separator)
    space_zh: str      # fixed hotel space label
    ghost_en: str      # "ARRIVAL\nTHE GATE"  (\n for line break)
    narrative: str     # ~60 chars connecting location story to space
    tagline: str       # ≤15 chars, the beat's single slogan
    mb_ghost_en: str   # moodboard left-col ghost EN (2-3 words, \n separated)
    mb_concept: str    # moodboard concept title (6-8 chars)
    mb_concept_sub: str
    mb_col2_title: str
    mb_col2_accent: str
    mb_col2_body: str  # ~80 chars
    mb_col3_title: str
    mb_col3_accent: str
    mb_col3_body: str  # ~80 chars


class IndigoStoryUnit(BaseModel):
    city: str
    district: str
    hotel_en: str               # e.g. "Shanghai Xintiandi"
    taglines: list[IndigoTagline] = Field(min_length=3, max_length=3)
    concept_poem: list[str]     # 2 paragraphs for brand concept cinematic
    origins: list[IndigoOrigin] = Field(min_length=3, max_length=3)
    emotion_headline: str       # e.g. "「石」库门的开启，「弄」里时光的流淌"
    emotion_poem: list[str]     # 2 paragraphs for story emotion cinematic
    story_summary: str          # ~60 chars for story summary slide
    beats: list[IndigoBeat] = Field(min_length=6, max_length=6)


class IndigoGenerateRequest(BaseModel):
    city: str
    district: str
    hotel_en: Optional[str] = None
