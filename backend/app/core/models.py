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


class GenerateRequest(BaseModel):
    city: str
    neighborhood: str
    hotel_name: Optional[str] = None


class EditRequest(BaseModel):
    story_unit: StoryUnit
    instruction: str
