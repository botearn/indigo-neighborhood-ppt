"""Public reference image lookup for Indigo atlas places."""

from __future__ import annotations

import html
import re
from functools import lru_cache

import httpx

from app.core.models import IndigoAtlasImageReference, IndigoAtlasPlace

COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
COMMONS_USER_AGENT = "indigo-neighborhood-ppt/0.1 local-research-reference-fetcher"


def fetch_public_reference_images(
    *,
    city: str,
    district: str,
    place: IndigoAtlasPlace,
    limit: int = 4,
) -> list[IndigoAtlasImageReference]:
    """Fetch sourced reference images from Wikimedia Commons.

    This is intentionally an API-backed source lookup rather than blind scraping:
    every returned image keeps its Commons source URL and license metadata.
    """
    collected: list[IndigoAtlasImageReference] = []
    seen: set[str] = set()

    for query in _search_queries(city, district, place):
        for reference in _query_commons(query, limit=max(limit * 2, 8)):
            key = reference.source_url or reference.image_url
            if not key or key in seen:
                continue
            seen.add(key)
            collected.append(reference.model_copy(deep=True))
            if len(collected) >= limit:
                return collected
        if collected:
            return collected

    return collected


def _search_queries(city: str, district: str, place: IndigoAtlasPlace) -> list[str]:
    candidates = [
        f"{place.name} {city} {district}",
        f"{place.name} {city}",
        place.name,
        f"{city} {district} {place.place_type}",
    ]
    queries: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        query = " ".join(candidate.split())
        if query and query not in seen:
            seen.add(query)
            queries.append(query)
    return queries[:2]


@lru_cache(maxsize=256)
def _query_commons(query: str, limit: int) -> tuple[IndigoAtlasImageReference, ...]:
    params = {
        "action": "query",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrsearch": query,
        "gsrlimit": str(min(max(limit, 1), 12)),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime|size",
        "iiurlwidth": "640",
        "format": "json",
        "formatversion": "2",
        "origin": "*",
    }
    headers = {"User-Agent": COMMONS_USER_AGENT}
    try:
        response = httpx.get(
            COMMONS_API_URL,
            params=params,
            headers=headers,
            timeout=httpx.Timeout(5.0, connect=2.5),
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return ()

    pages = data.get("query", {}).get("pages", [])
    if not isinstance(pages, list):
        return ()

    references: list[IndigoAtlasImageReference] = []
    for page in sorted(pages, key=lambda item: item.get("index", 999)):
        reference = _page_to_reference(page)
        if reference:
            references.append(reference)
    return tuple(references)


def _page_to_reference(page: dict) -> IndigoAtlasImageReference | None:
    image_info = (page.get("imageinfo") or [{}])[0]
    if not isinstance(image_info, dict):
        return None

    mime = image_info.get("mime") or ""
    if not str(mime).startswith("image/"):
        return None

    image_url = image_info.get("thumburl") or image_info.get("url") or ""
    source_url = image_info.get("descriptionurl") or ""
    if not image_url or not source_url:
        return None

    metadata = image_info.get("extmetadata") or {}
    object_name = _metadata_text(metadata, "ObjectName")
    description = _metadata_text(metadata, "ImageDescription")
    license_short = _metadata_text(metadata, "LicenseShortName")
    usage_terms = _metadata_text(metadata, "UsageTerms")
    license_url = _metadata_text(metadata, "LicenseUrl")
    artist = _metadata_text(metadata, "Artist")
    date = _metadata_text(metadata, "DateTimeOriginal") or _metadata_text(metadata, "DateTime")

    page_title = _clean_title(str(page.get("title") or ""))
    title = _clip(object_name or page_title or "Wikimedia Commons reference", 90)
    caption = _clip(description or title, 180)
    rights_status = _rights_status(license_short, usage_terms)
    notes = _notes([
        f"Credit: {artist}" if artist else "",
        f"Date: {date}" if date else "",
        f"License: {license_short or usage_terms}" if license_short or usage_terms else "",
        f"License URL: {license_url}" if license_url else "",
    ])

    return IndigoAtlasImageReference(
        title=title,
        caption=caption,
        image_url=image_url,
        source_title=f"Wikimedia Commons · {title}",
        source_url=source_url,
        rights_status=rights_status,
        alt_text=_clip(caption or title, 140),
        status="sourced",
        notes=notes or "Fetched from Wikimedia Commons public media repository.",
    )


def _metadata_text(metadata: dict, key: str) -> str:
    value = metadata.get(key, {})
    if isinstance(value, dict):
        value = value.get("value", "")
    return _clean_text(str(value or ""))


def _clean_text(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(without_tags)
    return " ".join(text.split())


def _clean_title(value: str) -> str:
    value = value.removeprefix("File:")
    value = re.sub(r"\.[A-Za-z0-9]{2,5}$", "", value)
    return _clean_text(value.replace("_", " "))


def _clip(value: str, limit: int) -> str:
    value = _clean_text(value)
    if len(value) <= limit:
        return value
    return f"{value[: limit - 1].rstrip()}..."


def _rights_status(license_short: str, usage_terms: str) -> str:
    rights = f"{license_short} {usage_terms}".lower()
    if "public domain" in rights or rights in {"pd", "cc0"}:
        return "public_domain"
    if "cc" in rights or "creative commons" in rights:
        return "licensed"
    return "needs_review"


def _notes(parts: list[str]) -> str:
    return " | ".join(part for part in parts if part)
