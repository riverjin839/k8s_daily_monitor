"""
TrendService: 수집 → 저장 → 요약 오케스트레이션
"""
import logging
from datetime import datetime, date, timedelta

from sqlalchemy.orm import Session

from app.models.trend import TrendSource, TrendItem, TrendDigest
from app.services.trends.github_collector import GitHubReleaseCollector
from app.services.trends.rss_collector import RSSCollector
from app.services.trends import summarizer

logger = logging.getLogger(__name__)


class TrendService:
    def __init__(self, db: Session):
        self.db = db
        self._github = GitHubReleaseCollector()
        self._rss = RSSCollector()

    # ── 수집 진입점 ─────────────────────────────────────────────

    async def run_daily_collect(
        self,
        target_date: date | None = None,
        lookback_days: int = 90,
    ) -> TrendDigest:
        """N일 치 트렌드 수집 + Ollama 요약.

        ``lookback_days`` — 며칠 전까지의 release/blog 를 가져올지. 기본 90일.
        K8s/Cilium 의 마이너 릴리즈 주기가 길어서 1일만 보면 거의 항상 비어있다.
        """
        if target_date is None:
            target_date = date.today()
        if lookback_days < 1:
            lookback_days = 1

        # 기존 digest 재사용 or 신규 생성
        digest = self.db.query(TrendDigest).filter(TrendDigest.digest_date == target_date).first()
        if digest is None:
            digest = TrendDigest(digest_date=target_date, status="collecting")
            self.db.add(digest)
            self.db.commit()
            self.db.refresh(digest)
        else:
            digest.status = "collecting"
            digest.error_message = None
            self.db.commit()

        since = datetime.combine(target_date - timedelta(days=lookback_days), datetime.min.time())

        try:
            sources = self.db.query(TrendSource).filter(TrendSource.enabled == True).all()
            new_items: list[TrendItem] = []

            for source in sources:
                collected = await self._collect_source(source, since, target_date)
                new_items.extend(collected)

            if new_items:
                self.db.bulk_save_objects(new_items)
                self.db.commit()

            # Ollama 요약
            digest.status = "summarizing"
            self.db.commit()

            all_items = (
                self.db.query(TrendItem)
                .filter(TrendItem.digest_date == target_date)
                .order_by(TrendItem.published_at.desc())
                .all()
            )

            # 개별 아이템 요약 (summary_ko 없는 것만)
            for item in all_items:
                if not item.summary_ko:
                    item.summary_ko = await summarizer.summarize_item(
                        item.title, item.raw_content or ""
                    )
            self.db.commit()

            # 전체 일별 요약
            items_dict = [
                {"category": i.source.category, "title": i.title, "version": i.version}
                for i in all_items
            ]
            digest.overall_summary_ko = await summarizer.summarize_digest(
                str(target_date), items_dict
            )
            digest.item_count = len(all_items)
            digest.status = "done"
            self.db.commit()
            self.db.refresh(digest)

        except Exception as e:
            logger.exception("트렌드 수집 실패: %s", e)
            digest.status = "failed"
            digest.error_message = str(e)
            self.db.commit()

        return digest

    async def _collect_source(
        self, source: TrendSource, since: datetime, target_date: date
    ) -> list[TrendItem]:
        try:
            if source.source_type == "github_release":
                raw = await self._github.collect(source.url, since)
            else:
                raw = await self._rss.collect(source.url, since)
        except Exception as e:
            logger.warning("소스 수집 실패 %s: %s", source.name, e)
            # UI 에서 바로 보이도록 소스 행에 기록
            source.last_status = "error"
            source.last_message = f"{type(e).__name__}: {str(e)[:500]}"
            source.last_collected_at = datetime.utcnow()
            self.db.commit()
            return []

        # 이미 수집된 URL은 스킵
        existing_urls: set[str] = {
            row[0]
            for row in self.db.query(TrendItem.url)
            .filter(TrendItem.digest_date == target_date)
            .all()
        }

        items = []
        for c in raw:
            if c.url in existing_urls:
                continue
            items.append(TrendItem(
                source_id=source.id,
                title=c.title,
                url=c.url,
                published_at=c.published_at,
                raw_content=c.raw_content,
                version=c.version,
                item_type=c.item_type,
                digest_date=target_date,
            ))

        source.last_status = "ok" if items else "empty"
        source.last_message = (
            f"{len(items)}개 신규 수집 (원본 {len(raw)}개, 중복 제외)"
            if items else f"수집 대상 없음 (since={since.date()}, 원본 {len(raw)}개 확인)"
        )
        source.last_item_count = len(items)
        source.last_collected_at = datetime.utcnow()
        self.db.commit()
        return items

    # ── 조회 ────────────────────────────────────────────────────

    def get_digest(self, target_date: date) -> TrendDigest | None:
        return self.db.query(TrendDigest).filter(TrendDigest.digest_date == target_date).first()

    def list_digests(self, limit: int = 30) -> list[TrendDigest]:
        return (
            self.db.query(TrendDigest)
            .order_by(TrendDigest.digest_date.desc())
            .limit(limit)
            .all()
        )

    def list_items(
        self,
        target_date: date,
        category: str | None = None,
        item_type: str | None = None,
    ) -> list[TrendItem]:
        q = (
            self.db.query(TrendItem)
            .join(TrendSource)
            .filter(TrendItem.digest_date == target_date)
        )
        if category:
            q = q.filter(TrendSource.category == category)
        if item_type:
            q = q.filter(TrendItem.item_type == item_type)
        return q.order_by(TrendItem.published_at.desc()).all()

    # ── 소스 관리 ────────────────────────────────────────────────

    def list_sources(self) -> list[TrendSource]:
        return self.db.query(TrendSource).order_by(TrendSource.category, TrendSource.name).all()

    def toggle_source(self, source_id: str, enabled: bool) -> TrendSource | None:
        src = self.db.query(TrendSource).filter(TrendSource.id == source_id).first()
        if src:
            src.enabled = enabled
            self.db.commit()
            self.db.refresh(src)
        return src

    def create_source(
        self, name: str, source_type: str, url: str, category: str, enabled: bool = True,
    ) -> TrendSource:
        src = TrendSource(
            name=name.strip(), source_type=source_type.strip(),
            url=url.strip(), category=category.strip(), enabled=enabled,
        )
        self.db.add(src)
        self.db.commit()
        self.db.refresh(src)
        return src

    def update_source(
        self, source_id: str, *,
        name: str | None = None, source_type: str | None = None,
        url: str | None = None, category: str | None = None,
        enabled: bool | None = None,
    ) -> TrendSource | None:
        src = self.db.query(TrendSource).filter(TrendSource.id == source_id).first()
        if not src:
            return None
        if name is not None:        src.name = name.strip()
        if source_type is not None: src.source_type = source_type.strip()
        if url is not None:         src.url = url.strip()
        if category is not None:    src.category = category.strip()
        if enabled is not None:     src.enabled = enabled
        self.db.commit()
        self.db.refresh(src)
        return src

    def delete_source(self, source_id: str) -> bool:
        src = self.db.query(TrendSource).filter(TrendSource.id == source_id).first()
        if not src:
            return False
        self.db.delete(src)
        self.db.commit()
        return True
