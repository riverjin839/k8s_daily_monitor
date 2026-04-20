import logging
import httpx
import feedparser
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from app.services.trends.base import BaseTrendCollector, CollectedItem

logger = logging.getLogger(__name__)

# feed URL → (display_name, category, item_type)
RSS_SOURCE_META: dict[str, tuple[str, str, str]] = {
    "https://kubernetes.io/feed.xml":         ("Kubernetes 블로그",  "k8s",    "blog"),
    "https://cilium.io/blog/rss.xml":         ("Cilium 블로그",      "cilium", "blog"),
    "https://www.cncf.io/blog/feed/":         ("CNCF 블로그",        "cncf",   "blog"),
    "https://lwn.net/headlines/rss":          ("LWN.net",           "linux",  "news"),
    "https://www.kernel.org/feeds/all.atom.xml": ("kernel.org",     "linux",  "release"),
}


class RSSCollector(BaseTrendCollector):
    """RSS/Atom 피드 수집"""

    async def collect(self, url: str, since: datetime) -> list[CollectedItem]:
        display_name, category, item_type = RSS_SOURCE_META.get(url, (url, "unknown", "news"))
        raw_xml = await _fetch_feed(url)
        if not raw_xml:
            return []

        feed = feedparser.parse(raw_xml)
        since_aware = since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since
        items: list[CollectedItem] = []

        for entry in feed.entries:
            published = _parse_date(entry)
            if published is None or published < since_aware:
                continue
            content = _entry_content(entry)
            items.append(CollectedItem(
                source_name=display_name,
                source_type="rss",
                category=category,
                item_type=item_type,
                title=entry.get("title", "(제목 없음)"),
                url=entry.get("link", ""),
                published_at=published.replace(tzinfo=None),
                raw_content=content,
            ))
        return items


async def _fetch_feed(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "k8s-daily-monitor/1.0"})
            r.raise_for_status()
            return r.text
    except Exception as e:
        logger.warning("RSS fetch failed %s: %s", url, e)
        return None


def _parse_date(entry) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed"):
        tup = getattr(entry, attr, None)
        if tup:
            from calendar import timegm
            return datetime.utcfromtimestamp(timegm(tup)).replace(tzinfo=timezone.utc)
    for attr in ("published", "updated"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return parsedate_to_datetime(val)
            except Exception:
                pass
    return None


def _entry_content(entry) -> str:
    if hasattr(entry, "content") and entry.content:
        return _strip_html(entry.content[0].get("value", ""))
    summary = entry.get("summary", "")
    return _strip_html(summary)[:2000]


def _strip_html(html: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()[:2000]
