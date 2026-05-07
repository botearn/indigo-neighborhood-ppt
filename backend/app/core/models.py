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
