from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import re
from zipfile import ZIP_STORED, ZipFile

from PIL import Image

from app.core.models import IndigoStoryUnit
from app.services import image_assets


IMAGE_FIELDS = (
    ("image_url", "main"),
    ("mood_image_url", "mood"),
    ("col2_image_url", "design"),
    ("col3_image_url", "detail"),
)
EXPECTED_IMAGE_COUNT = 24
_UNSAFE_FILENAME = re.compile(r'[\\/:*?"<>|\x00-\x1f]+')
_FORMAT_EXTENSIONS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}


def _filename_segment(value: str, fallback: str) -> str:
    cleaned = _UNSAFE_FILENAME.sub("-", value).strip(" .-")
    return cleaned or fallback


def _image_extension(data: bytes) -> str:
    with Image.open(BytesIO(data)) as image:
        return _FORMAT_EXTENSIONS.get(image.format or "", ".jpg")


def build_indigo_image_archive(story: IndigoStoryUnit) -> bytes:
    targets = [
        (
            beat.num or f"{beat_index + 1:02d}",
            beat.space_zh,
            field_label,
            getattr(beat, field, None),
        )
        for beat_index, beat in enumerate(story.beats)
        for field, field_label in IMAGE_FIELDS
    ]
    available = [target for target in targets if target[3]]
    if len(available) != EXPECTED_IMAGE_COUNT:
        raise ValueError(
            f"需要 24 张图片全部生成完成后才能下载（当前 {len(available)} / 24）"
        )

    worker_count = min(8, len(available))
    with ThreadPoolExecutor(
        max_workers=worker_count,
        thread_name_prefix="image-archive",
    ) as executor:
        image_data = list(
            executor.map(
                image_assets.load_image_bytes,
                (str(target[3]) for target in available),
            )
        )

    archive = BytesIO()
    with ZipFile(archive, "w", compression=ZIP_STORED) as output:
        for target, data in zip(available, image_data, strict=True):
            beat_num, space_zh, field_label, _url = target
            folder = f"{_filename_segment(beat_num, 'beat')}_{_filename_segment(space_zh, 'space')}"
            filename = f"{field_label}{_image_extension(data)}"
            output.writestr(str(Path(folder) / filename), data)
    return archive.getvalue()
