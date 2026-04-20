import re
import httpx
from datetime import datetime, timezone

from app.config import settings
from app.services.trends.base import BaseTrendCollector, CollectedItem

# GitHub slug → display name + category
GITHUB_SOURCES: dict[str, tuple[str, str]] = {
    "kubernetes/kubernetes": ("Kubernetes", "k8s"),
    "cilium/cilium":         ("Cilium",     "cilium"),
    "torvalds/linux":        ("Linux Kernel", "linux"),
}


class GitHubReleaseCollector(BaseTrendCollector):
    """GitHub Releases API를 통해 릴리즈 노트 수집"""

    def __init__(self):
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if settings.trends_github_token:
            headers["Authorization"] = f"Bearer {settings.trends_github_token}"
        self._headers = headers

    async def collect(self, url: str, since: datetime) -> list[CollectedItem]:
        """url = 'owner/repo' 슬러그"""
        display_name, category = GITHUB_SOURCES.get(url, (url, "unknown"))
        api_url = f"{settings.trends_github_api_url}/repos/{url}/releases?per_page=20"

        items: list[CollectedItem] = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(api_url, headers=self._headers)
                r.raise_for_status()
                releases = r.json()
        except Exception:
            return []

        since_aware = since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since
        for rel in releases:
            published_str = rel.get("published_at") or rel.get("created_at", "")
            try:
                published = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
            except Exception:
                continue
            if published < since_aware:
                continue
            body = rel.get("body") or ""
            items.append(CollectedItem(
                source_name=display_name,
                source_type="github_release",
                category=category,
                item_type="release",
                title=f"{display_name} {rel['tag_name']} 릴리즈",
                url=rel.get("html_url", ""),
                published_at=published.replace(tzinfo=None),
                raw_content=_trim(body, 2000),
                version=rel.get("tag_name"),
            ))
        return items


def _trim(text: str, max_len: int) -> str:
    return text[:max_len] + "…" if len(text) > max_len else text
