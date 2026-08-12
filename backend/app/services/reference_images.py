"""Search-and-scrape reference image lookup for Indigo atlas places."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from functools import lru_cache
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse

import httpx

from app.core.models import IndigoAtlasImageReference, IndigoAtlasPlace
from app.services.image_assets import persist_image_bytes

SEARCH_URL = "https://duckduckgo.com/html/"
SCRAPER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
REQUEST_HEADERS = {
    "User-Agent": SCRAPER_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
}
MAX_SEARCH_RESULTS = 6
MAX_PAGES_TO_SCRAPE = 4
MAX_IMAGE_DOWNLOAD_ATTEMPTS = 8
MAX_HTML_CHARS = 1_200_000
MAX_IMAGE_BYTES = 9_000_000
MIN_IMAGE_BYTES = 8_000
SKIP_IMAGE_EXTENSIONS = {".svg", ".ico"}
NOISY_IMAGE_RE = re.compile(
    r"(favicon|logo|sprite|avatar|icon|blank|placeholder|transparent|loading|qrcode|qr-code|wechat)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class PageImageCandidate:
    image_url: str
    source_url: str
    source_title: str = ""
    alt_text: str = ""
    rank: int = 10


def fetch_public_reference_images(
    *,
    city: str,
    district: str,
    place: IndigoAtlasPlace,
    limit: int = 4,
) -> list[IndigoAtlasImageReference]:
    """Find public web pages, scrape image candidates, and cache image copies.

    These are internal research references. They are intentionally marked
    `needs_review` because ordinary public web images do not imply permission for
    external publication.
    """
    collected: list[IndigoAtlasImageReference] = []
    seen_images: set[str] = set()
    attempted_downloads = 0

    for query in _search_queries(city, district, place):
        for page_url in _search_result_pages(query)[:MAX_PAGES_TO_SCRAPE]:
            for candidate in _page_image_candidates(page_url):
                if candidate.image_url in seen_images:
                    continue
                seen_images.add(candidate.image_url)
                attempted_downloads += 1

                reference = _download_reference(candidate, place.name)
                if reference:
                    collected.append(reference)
                    if len(collected) >= limit:
                        return collected

                if attempted_downloads >= MAX_IMAGE_DOWNLOAD_ATTEMPTS:
                    return collected

        if collected:
            return collected

    return collected


def _search_queries(city: str, district: str, place: IndigoAtlasPlace) -> list[str]:
    candidates = [
        f"{place.name} {city} {district} 图片 照片",
        f"{place.name} {city} 图片",
        f"{place.name} {place.place_type} photo",
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
def _search_result_pages(query: str) -> tuple[str, ...]:
    try:
        response = httpx.get(
            SEARCH_URL,
            params={"q": query},
            headers=REQUEST_HEADERS,
            timeout=httpx.Timeout(5.0, connect=2.5),
            follow_redirects=True,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return ()

    parser = SearchResultParser()
    parser.feed(response.text[:MAX_HTML_CHARS])
    pages: list[str] = []
    seen: set[str] = set()
    for url in parser.urls:
        normalized = _normalize_page_url(url)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        pages.append(normalized)
        if len(pages) >= MAX_SEARCH_RESULTS:
            break
    return tuple(pages)


class SearchResultParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        attr = _attrs(attrs)
        class_name = attr.get("class", "")
        href = attr.get("href", "")
        if "result__a" not in class_name and "result__url" not in class_name:
            return
        decoded = _decode_duckduckgo_link(href)
        if decoded:
            self.urls.append(decoded)


@lru_cache(maxsize=512)
def _page_image_candidates(page_url: str) -> tuple[PageImageCandidate, ...]:
    try:
        response = httpx.get(
            page_url,
            headers=REQUEST_HEADERS,
            timeout=httpx.Timeout(4.0, connect=2.5),
            follow_redirects=True,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return ()

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type and "xml" not in content_type and "text" not in content_type:
        return ()

    final_url = str(response.url)
    parser = PageImageParser(final_url)
    parser.feed(response.text[:MAX_HTML_CHARS])

    candidates: list[PageImageCandidate] = []
    seen: set[str] = set()
    source_title = _clip(parser.title, 90)
    for candidate in sorted(parser.candidates, key=lambda item: item.rank):
        normalized = _normalize_image_url(candidate.image_url, final_url)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        candidates.append(
            PageImageCandidate(
                image_url=normalized,
                source_url=final_url,
                source_title=source_title or _domain_label(final_url),
                alt_text=_clip(candidate.alt_text, 140),
                rank=candidate.rank,
            )
        )
    return tuple(candidates)


class PageImageParser(HTMLParser):
    def __init__(self, page_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.candidates: list[PageImageCandidate] = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr = _attrs(attrs)

        if tag == "title":
            self._in_title = True
            return

        if tag == "meta":
            key = (attr.get("property") or attr.get("name") or "").lower()
            if key in {"og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"}:
                self._add(attr.get("content", ""), attr.get("alt", ""), rank=0)
            return

        if tag == "link":
            rel = attr.get("rel", "").lower()
            if "image_src" in rel:
                self._add(attr.get("href", ""), "", rank=1)
            return

        if tag == "img":
            alt = attr.get("alt") or attr.get("title") or ""
            class_name = attr.get("class", "")
            if NOISY_IMAGE_RE.search(class_name):
                return
            for key in ("data-original", "data-src", "data-lazy-src", "data-actualsrc", "src"):
                self._add(attr.get(key, ""), alt, rank=4 if key.startswith("data-") else 6)
            for key in ("srcset", "data-srcset"):
                self._add(_srcset_best(attr.get(key, "")), alt, rank=5)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title = _clean_text(f"{self.title} {data}")

    def _add(self, raw_url: str, alt_text: str, *, rank: int) -> None:
        if not raw_url:
            return
        self.candidates.append(
            PageImageCandidate(
                image_url=raw_url,
                source_url=self.page_url,
                alt_text=alt_text,
                rank=rank,
            )
        )


def _download_reference(candidate: PageImageCandidate, place_name: str) -> IndigoAtlasImageReference | None:
    try:
        image_bytes, content_type = _download_image_bytes(candidate)
        if len(image_bytes) < MIN_IMAGE_BYTES:
            return None
        if "svg" in content_type:
            return None
        cached_url = persist_image_bytes(image_bytes)
    except Exception:
        return None

    source_title = candidate.source_title or _domain_label(candidate.source_url)
    title = _clip(candidate.alt_text or source_title or f"{place_name} reference image", 90)
    caption = _clip(candidate.alt_text or f"{place_name} reference image from {source_title}", 180)
    return IndigoAtlasImageReference(
        title=title,
        caption=caption,
        image_url=cached_url,
        source_title=source_title,
        source_url=candidate.source_url,
        rights_status="needs_review",
        alt_text=caption,
        status="scraped",
        notes=(
            "Scraped and cached from a public web page for internal research reference only. "
            f"Original image URL: {candidate.image_url}"
        ),
    )


def _download_image_bytes(candidate: PageImageCandidate) -> tuple[bytes, str]:
    headers = {
        **REQUEST_HEADERS,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": candidate.source_url,
    }
    chunks: list[bytes] = []
    total = 0
    with httpx.stream(
        "GET",
        candidate.image_url,
        headers=headers,
        timeout=httpx.Timeout(5.0, connect=2.5),
        follow_redirects=True,
    ) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if not content_type.startswith("image/"):
            raise ValueError("not an image response")
        content_length = int(response.headers.get("content-length") or 0)
        if content_length > MAX_IMAGE_BYTES:
            raise ValueError("image too large")
        for chunk in response.iter_bytes():
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                raise ValueError("image too large")
            chunks.append(chunk)
    return b"".join(chunks), content_type


def _attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
    return {key.lower(): html.unescape(value or "") for key, value in attrs}


def _decode_duckduckgo_link(href: str) -> str:
    if not href:
        return ""
    url = html.unescape(href)
    if url.startswith("//"):
        url = f"https:{url}"
    elif url.startswith("/"):
        url = urljoin("https://duckduckgo.com", url)
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        return target
    return url


def _normalize_page_url(raw_url: str) -> str:
    url = html.unescape(raw_url).strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    if parsed.netloc.endswith("duckduckgo.com"):
        return ""
    return url


def _normalize_image_url(raw_url: str, page_url: str) -> str:
    value = html.unescape(raw_url).strip()
    if not value or value.startswith(("data:", "blob:", "javascript:")):
        return ""
    if value.startswith("//"):
        value = f"https:{value}"
    url = urljoin(page_url, value)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    path = parsed.path.lower()
    if any(path.endswith(extension) for extension in SKIP_IMAGE_EXTENSIONS):
        return ""
    if NOISY_IMAGE_RE.search(url):
        return ""
    return url


def _srcset_best(value: str) -> str:
    candidates: list[tuple[float, str]] = []
    for raw_part in value.split(","):
        part = raw_part.strip()
        if not part:
            continue
        bits = part.split()
        url = bits[0]
        score = 1.0
        if len(bits) > 1:
            descriptor = bits[1]
            try:
                if descriptor.endswith("w"):
                    score = float(descriptor[:-1])
                elif descriptor.endswith("x"):
                    score = float(descriptor[:-1]) * 1000
            except ValueError:
                score = 1.0
        candidates.append((score, url))
    if not candidates:
        return ""
    return max(candidates, key=lambda item: item[0])[1]


def _domain_label(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.removeprefix("www.") or "web source"


def _clean_text(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(without_tags)
    return " ".join(text.split())


def _clip(value: str, limit: int) -> str:
    value = _clean_text(value)
    if len(value) <= limit:
        return value
    return f"{value[: limit - 1].rstrip()}..."
