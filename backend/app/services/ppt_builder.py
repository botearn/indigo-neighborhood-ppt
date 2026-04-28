import io
import base64
import httpx
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from lxml import etree
from app.core.models import StoryUnit, Beat


SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

C_BG = RGBColor(0x0F, 0x11, 0x16)
C_PANEL = RGBColor(0x13, 0x16, 0x1C)
C_CREAM = RGBColor(0xF5, 0xF0, 0xE6)
C_AMBER = RGBColor(0xC8, 0xA9, 0x6E)
C_BODY = RGBColor(0xE8, 0xE2, 0xD4)
C_MUTED = RGBColor(0xA8, 0xA3, 0x97)
C_DIM = RGBColor(0x6B, 0x72, 0x80)


def _decode_data_url(data_url: str) -> bytes:
    _, b64 = data_url.split(",", 1)
    return base64.b64decode(b64)


def _fetch_image(url: str) -> bytes | None:
    if url.startswith("data:"):
        try:
            return _decode_data_url(url)
        except Exception:
            return None
    try:
        r = httpx.get(url, timeout=15, follow_redirects=True)
        r.raise_for_status()
        return r.content
    except Exception:
        return None


def build_ppt_from_slides(slide_data_urls: list[str]) -> bytes:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    blank = prs.slide_layouts[6]

    for url in slide_data_urls:
        slide = prs.slides.add_slide(blank)
        png = _decode_data_url(url)
        slide.shapes.add_picture(io.BytesIO(png), 0, 0, width=SLIDE_W, height=SLIDE_H)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _blank(prs: Presentation):
    return prs.slides.add_slide(prs.slide_layouts[6])


def _bg(slide, color=C_BG):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _alpha(shape, val: int):
    try:
        sp = shape.fill._xPr
        sf = sp.find(qn("a:solidFill"))
        clr = sf.find(qn("a:srgbClr"))
        if clr is None:
            clr = sf.find(qn("a:sysClr"))
        a = etree.SubElement(clr, qn("a:alpha"))
        a.set("val", str(val))
    except Exception:
        pass


def _box(slide, l, t, w, h, color, alpha=None):
    s = slide.shapes.add_shape(1, l, t, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()
    if alpha:
        _alpha(s, alpha)
    return s


def _txt(slide, text, l, t, w, h, *, sz=22, bold=False, color=C_CREAM, align=PP_ALIGN.LEFT):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(sz)
    run.font.bold = bold
    run.font.color.rgb = color


def _rule(slide, l, t, w, color=C_AMBER, thick=1.5):
    s = slide.shapes.add_shape(1, l, t, w, Pt(thick))
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()


def _picture(slide, url: str, l, t, w, h):
    img = _fetch_image(url)
    if not img:
        return False
    try:
        slide.shapes.add_picture(io.BytesIO(img), l, t, width=w, height=h)
        return True
    except Exception:
        return False


def _cover_slide(prs, story: StoryUnit):
    s = _blank(prs)
    _bg(s)
    if story.mood_image_url and _picture(s, story.mood_image_url, 0, 0, SLIDE_W, SLIDE_H):
        _box(s, 0, 0, SLIDE_W, SLIDE_H, RGBColor(0x08, 0x06, 0x04), alpha=70000)
    _txt(s, "HOTEL INDIGO", Inches(1), Inches(0.7), Inches(11.3), Inches(0.4),
         sz=10, color=C_AMBER)
    _txt(s, story.signature.zh, Inches(1), Inches(3.0), Inches(11.3), Inches(2.0),
         sz=72, color=C_CREAM)
    _txt(s, story.signature.en.upper(), Inches(1), Inches(5.1), Inches(11.3), Inches(0.5),
         sz=18, color=C_AMBER)
    _txt(s, f"{story.city.upper()}  ·  {story.neighborhood.upper()}",
         Inches(1), Inches(6.7), Inches(11.3), Inches(0.4), sz=11, color=C_MUTED)


def _hook_slide(prs, story: StoryUnit):
    s = _blank(prs)
    _bg(s, C_PANEL)
    _txt(s, "STREET ENTRANCE", Inches(1.2), Inches(1.2), Inches(8), Inches(0.4),
         sz=10, color=C_AMBER)
    _rule(s, Inches(1.2), Inches(2.0), Inches(0.7))
    _txt(s, story.hook_line, Inches(1.2), Inches(2.6), Inches(11), Inches(2.5),
         sz=48, color=C_CREAM)
    _txt(s, story.anchor, Inches(1.2), Inches(5.6), Inches(11), Inches(0.5),
         sz=18, color=C_MUTED)


def _beat_slide(prs, beat: Beat, index: int, total: int):
    s = _blank(prs)
    _bg(s)
    has_img = bool(beat.image_url) and _picture(s, beat.image_url, 0, 0, Inches(6.7), SLIDE_H)
    if not has_img:
        _box(s, 0, 0, Inches(6.7), SLIDE_H, C_PANEL)
    text_l = Inches(7.1)
    text_w = Inches(5.9)
    _txt(s, f"{index:02d} / {total:02d}", text_l, Inches(0.9), text_w, Inches(0.35),
         sz=10, color=C_DIM)
    _txt(s, beat.verb, text_l, Inches(1.35), text_w, Inches(0.4),
         sz=12, bold=True, color=C_AMBER)
    _txt(s, beat.title, text_l, Inches(1.95), text_w, Inches(1.1),
         sz=34, color=C_CREAM)
    _rule(s, text_l, Inches(3.2), Inches(0.6))
    _txt(s, beat.copy, text_l, Inches(3.45), text_w, Inches(1.0),
         sz=18, color=C_BODY)
    if beat.detail:
        _txt(s, beat.detail, text_l, Inches(4.7), text_w, Inches(1.8),
             sz=13, color=C_MUTED)
    sensory = "  ·  ".join(d.description for d in beat.sensory)
    if sensory:
        _txt(s, sensory, text_l, Inches(6.6), text_w, Inches(0.5),
             sz=10, color=C_DIM)


def _action_slide(prs, story: StoryUnit):
    s = _blank(prs)
    _bg(s)
    _txt(s, "STEP OUT", Inches(1), Inches(2.0), Inches(11.3), Inches(0.4),
         sz=11, color=C_AMBER, align=PP_ALIGN.CENTER)
    _rule(s, Inches(6.17), Inches(2.7), Inches(1.0))
    _txt(s, story.action_cue, Inches(1), Inches(3.2), Inches(11.3), Inches(2),
         sz=44, color=C_CREAM, align=PP_ALIGN.CENTER)
    _rule(s, Inches(6.17), Inches(5.3), Inches(1.0))


def _closing_slide(prs, story: StoryUnit):
    s = _blank(prs)
    _bg(s)
    _txt(s, story.signature.zh, Inches(1), Inches(2.7), Inches(11.3), Inches(1.5),
         sz=56, color=C_CREAM, align=PP_ALIGN.CENTER)
    _txt(s, story.signature.en.upper(), Inches(1), Inches(4.0), Inches(11.3), Inches(0.5),
         sz=14, color=C_AMBER, align=PP_ALIGN.CENTER)
    _txt(s, f"HOTEL INDIGO  ·  {story.city.upper()}  ·  {story.neighborhood.upper()}",
         Inches(1), Inches(6.7), Inches(11.3), Inches(0.4),
         sz=10, color=C_DIM, align=PP_ALIGN.CENTER)


def build_ppt_from_story(story: StoryUnit) -> bytes:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    _cover_slide(prs, story)
    _hook_slide(prs, story)
    total = len(story.beats)
    for i, beat in enumerate(story.beats, start=1):
        _beat_slide(prs, beat, i, total)
    _action_slide(prs, story)
    _closing_slide(prs, story)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
