"""ClusterCustomField — 클러스터 테이블의 사용자 정의 컬럼.

Confluence 의 테이블 커스터마이즈처럼 여러 클러스터에 공통으로 추가되는 컬럼을
관리한다. 각 클러스터의 실제 값은 Cluster.custom_values (JSONB) 에 저장.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class ClusterCustomField(Base):
    __tablename__ = "cluster_custom_fields"
    __table_args__ = (
        UniqueConstraint("key", name="uq_cluster_custom_fields_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(64), nullable=False)                    # custom_values JSON 의 키
    label = Column(String(128), nullable=False)                 # 테이블 헤더에 표시될 이름
    data_type = Column(String(32), nullable=False, default="text")  # text / number / date / checkbox / select
    options = Column(JSONB, nullable=True)                      # select 타입일 때 선택 옵션 목록
    description = Column(Text, nullable=True)                   # 컬럼 설명 (tooltip)
    sort_order = Column(Integer, nullable=False, default=0)     # 표시 순서
    width = Column(Integer, nullable=True)                      # 선택적 컬럼 너비 (px)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ClusterCustomField(key={self.key}, label={self.label}, type={self.data_type})>"
