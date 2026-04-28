import io
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from app.core.models import StoryUnit

# Palette
BG_DARK = RGBColor(0x0F, 0x0F, 0x0F)
BG_CARD = RGBColor(0x1A, 0x1A, 0x18)
GOLD = RGBColor(0xC8, 0xA9, 0x6E)
WHITE = RGBColor(0xF5, 0xF5, 0xF0)
MUTED = RGBColor(0x6B, 0x72, 0x80)

W = Inches(13.33)
H = Inches(7.5)


def _new_slide(prs: Presentation, layout_idx: int = 6):
    layout = prs.slide_layouts[layout_idx]
    return prs.slides.add_slide(layout)


def _fill(shape, color: RGBColor):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color


def _add_rect(slide, left, top, width, height, color: RGBColor):
    shape = slide.shapes.add_shape(1, left, top, width, height)
    _fill(shape, color)
    shape.line.fill.background()
    return shape


def _add_text(slide, text: str, left, top, width, height,
               size: int, color: RGBColor, bold=False, align=PP_ALIGN.LEFT):
    txb = slide.shapes.add_textbox(left, top, width, height)
    tf = txb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    return txb


def _bg(slide):
    _add_rect(slide, 0, 0, W, H, BG_DARK)


def build_ppt(story: StoryUnit) -> bytes:
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H

    # Slide 1 — Mood Opening
    s = _new_slide(prs)
    _bg(s)
    _add_rect(s, Inches(0), Inches(2.8), W, Pt(1), GOLD)
    _add_text(s, story.signature.zh, Inches(1.5), Inches(1.8), Inches(10), Inches(1.2),
              60, WHITE, bold=True, align=PP_ALIGN.CENTER)
    _add_text(s, story.signature.en.upper(), Inches(1.5), Inches(3.1), Inches(10), Inches(0.7),
              18, GOLD, align=PP_ALIGN.CENTER)
    _add_text(s, f"Hotel Indigo · {story.neighborhood} · {story.city}",
              Inches(1.5), Inches(6.5), Inches(10), Inches(0.5),
              11, MUTED, align=PP_ALIGN.CENTER)

    # Slide 2 — Neighborhood Card
    s = _new_slide(prs)
    _bg(s)
    _add_rect(s, Inches(0.8), Inches(1.2), Pt(3), Inches(1.0), GOLD)
    _add_text(s, story.neighborhood, Inches(1.2), Inches(1.0), Inches(8), Inches(1.0),
              40, WHITE, bold=True)
    _add_text(s, story.hook_line, Inches(1.2), Inches(2.4), Inches(9), Inches(1.2),
              24, WHITE)
    _add_text(s, story.anchor, Inches(1.2), Inches(4.0), Inches(6), Inches(0.5),
              13, MUTED)

    # Slides 3–N — Story Beats
    verb_colors = {
        "DO": RGBColor(0xE8, 0x6A, 0x2F),
        "SEE": RGBColor(0x5B, 0x8D, 0xB8),
        "HEAR": RGBColor(0x7B, 0xB5, 0x8A),
        "TASTE": RGBColor(0xC8, 0xA9, 0x6E),
        "DRINK": RGBColor(0x9B, 0x7B, 0xB5),
        "BUY": RGBColor(0xB5, 0x7B, 0x7B),
    }
    for i, beat in enumerate(story.beats, 1):
        s = _new_slide(prs)
        _bg(s)
        verb_color = verb_colors.get(beat.verb, GOLD)
        _add_rect(s, Inches(0), Inches(0), Inches(0.15), H, verb_color)
        badge = f"[ {beat.verb} ]"
        _add_text(s, badge, Inches(0.4), Inches(0.9), Inches(3), Inches(0.5),
                  11, verb_color, bold=True)
        _add_text(s, beat.title, Inches(0.4), Inches(1.5), Inches(9), Inches(1.0),
                  36, WHITE, bold=True)
        _add_text(s, beat.copy, Inches(0.4), Inches(2.8), Inches(9), Inches(1.2),
                  20, WHITE)
        if beat.detail:
            _add_text(s, beat.detail, Inches(0.4), Inches(4.0), Inches(11), Inches(1.4),
                      14, RGBColor(0xA8, 0xA8, 0xA0))
        sensory_text = "  ·  ".join(d.description for d in beat.sensory[:3])
        _add_text(s, sensory_text, Inches(0.4), Inches(5.8), Inches(12), Inches(0.7),
                  12, MUTED)

    # Slide N+1 — Action Cue
    s = _new_slide(prs)
    _bg(s)
    _add_rect(s, Inches(1.5), Inches(3.4), Inches(10.3), Pt(1), GOLD)
    _add_text(s, story.action_cue, Inches(1.5), Inches(2.4), Inches(10), Inches(1.2),
              28, WHITE, align=PP_ALIGN.CENTER)
    _add_text(s, "Hotel Indigo", Inches(1.5), Inches(3.8), Inches(10), Inches(0.5),
              13, GOLD, align=PP_ALIGN.CENTER)

    # Slide N+2 — Closing
    s = _new_slide(prs)
    _bg(s)
    _add_text(s, story.signature.zh, Inches(1.5), Inches(2.8), Inches(10), Inches(1.2),
              48, WHITE, bold=True, align=PP_ALIGN.CENTER)
    _add_text(s, f"{story.neighborhood}  ·  {story.city}",
              Inches(1.5), Inches(4.2), Inches(10), Inches(0.5),
              14, MUTED, align=PP_ALIGN.CENTER)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
