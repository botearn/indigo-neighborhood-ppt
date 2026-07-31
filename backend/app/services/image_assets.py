import base64
import re
import secrets
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps

from app.core.config import settings


ASSET_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{24,80}\.jpg$")
MAX_IMAGE_SIZE = (1792, 1024)


def _media_dir() -> Path:
    path = Path(settings.image_job_media_dir)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _asset_url(asset_name: str) -> str:
    path = f"/api/indigo/image-assets/{asset_name}"
    base = settings.public_base_url.strip().rstrip("/")
    return f"{base}{path}" if base else path


def _image_bytes(image_url: str) -> bytes:
    if image_url.startswith("data:"):
        header, separator, payload = image_url.partition(",")
        if not separator or ";base64" not in header:
            raise ValueError("Unsupported image data URL")
        return base64.b64decode(payload, validate=True)

    response = httpx.get(image_url, timeout=90, follow_redirects=True)
    response.raise_for_status()
    return response.content


def load_image_bytes(image_url: str) -> bytes:
    asset_path = urlparse(image_url).path
    if "/api/indigo/image-assets/" in asset_path:
        asset_name = Path(asset_path).name
        try:
            return resolve_image_asset(asset_name).read_bytes()
        except FileNotFoundError:
            if not urlparse(image_url).scheme:
                raise
    return _image_bytes(image_url)


def persist_image(image_url: str) -> str:
    if "/api/indigo/image-assets/" in image_url:
        return image_url

    image = Image.open(BytesIO(_image_bytes(image_url)))
    image = ImageOps.exif_transpose(image)
    image.thumbnail(MAX_IMAGE_SIZE, Image.Resampling.LANCZOS)
    if image.mode != "RGB":
        image = image.convert("RGBA")
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A"))
        image = background

    asset_name = f"{secrets.token_urlsafe(24)}.jpg"
    destination = _media_dir() / asset_name
    temporary = destination.with_suffix(".tmp")
    image.save(temporary, format="JPEG", quality=84, optimize=True, progressive=True)
    temporary.replace(destination)
    return _asset_url(asset_name)


def resolve_image_asset(asset_name: str) -> Path:
    if not ASSET_NAME_PATTERN.fullmatch(asset_name):
        raise FileNotFoundError(asset_name)
    path = _media_dir() / asset_name
    if not path.is_file():
        raise FileNotFoundError(asset_name)
    return path


def delete_image(image_url: str) -> None:
    asset_name = Path(urlparse(image_url).path).name
    if not ASSET_NAME_PATTERN.fullmatch(asset_name):
        return
    try:
        (_media_dir() / asset_name).unlink()
    except FileNotFoundError:
        pass
