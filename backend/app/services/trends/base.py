from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CollectedItem:
    source_name: str
    source_type: str   # "github_release" | "rss"
    category: str
    item_type: str     # "release" | "blog" | "news"
    title: str
    url: str
    published_at: datetime
    raw_content: str
    version: str | None = None


class BaseTrendCollector(ABC):
    @abstractmethod
    async def collect(self, url: str, since: datetime) -> list[CollectedItem]:
        """수집: since 이후 발행된 아이템 반환"""
        ...
