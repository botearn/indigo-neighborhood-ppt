from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional


class SixVerb(str, Enum):
    DO = "DO"
    SEE = "SEE"
    HEAR = "HEAR"
    TASTE = "TASTE"
    DRINK = "DRINK"
    BUY = "BUY"


class Signature(BaseModel):
    zh: str = Field(description="≤8字，禁用：文化/风情/韵味/之都/名片/地标/代表")
    en: str = Field(description="≤6词")


class SensoryDetail(BaseModel):
    type: str   # sound / smell / light / texture
    description: str


class Beat(BaseModel):
    title: str
    copy: str
    verb: SixVerb
    sensory: list[SensoryDetail]
    image_url: Optional[str] = None


class StoryUnit(BaseModel):
    city: str
    neighborhood: str
    signature: Signature
    anchor: str
    hook_line: str
    beats: list[Beat]
    action_cue: str
    mood_image_url: Optional[str] = None


class GenerateRequest(BaseModel):
    city: str
    neighborhood: str
    hotel_name: Optional[str] = None


class EditRequest(BaseModel):
    story_unit: StoryUnit
    instruction: str
