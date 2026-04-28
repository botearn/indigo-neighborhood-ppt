import io
import base64
from pptx import Presentation
from pptx.util import Inches


SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)


def _decode_data_url(data_url: str) -> bytes:
    _, b64 = data_url.split(",", 1)
    return base64.b64decode(b64)


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
