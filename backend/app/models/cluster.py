import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class StatusEnum(str, enum.Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    api_endpoint = Column(String(255), nullable=False)
    kubeconfig_path = Column(String(255), nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.healthy)

    # 클러스터 관리 메타데이터
    region = Column(String(100), nullable=True)           # 지역
    operation_level = Column(String(50), nullable=True)   # 운영레벨 (production/staging/dev/test)
    max_pod = Column(Integer, nullable=True)              # Node당 최대 Pod 수
    cilium_config = Column(Text, nullable=True)           # 주요 Cilium 설정
    cidr = Column(String(255), nullable=True)             # Node CIDR 대역
    first_host = Column(String(100), nullable=True)       # Node 첫 번째 호스트 IP
    last_host = Column(String(100), nullable=True)        # Node 마지막 호스트 IP
    description = Column(Text, nullable=True)             # 정보/설명
    node_count = Column(Integer, nullable=True)           # 노드 수
    hostname = Column(String(255), nullable=True)         # 호스트명
    # Pod CIDR 대역
    pod_cidr = Column(String(255), nullable=True)
    pod_first_host = Column(String(100), nullable=True)
    pod_last_host = Column(String(100), nullable=True)
    # Service CIDR 대역
    svc_cidr = Column(String(255), nullable=True)
    svc_first_host = Column(String(100), nullable=True)
    svc_last_host = Column(String(100), nullable=True)
    # NIC 정보 (ifconfig: bond0, bond1)
    bond0_ip = Column(String(100), nullable=True)
    bond0_mac = Column(String(50), nullable=True)
    bond1_ip = Column(String(100), nullable=True)
    bond1_mac = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    addons = relationship("Addon", back_populates="cluster", cascade="all, delete-orphan")
    check_logs = relationship("CheckLog", back_populates="cluster", cascade="all, delete-orphan")
    playbooks = relationship("Playbook", back_populates="cluster", cascade="all, delete-orphan")
    issues = relationship("Issue", back_populates="cluster", foreign_keys="Issue.cluster_id")
    tasks = relationship("Task", back_populates="cluster", foreign_keys="Task.cluster_id")

    def __repr__(self):
        return f"<Cluster(name={self.name}, status={self.status})>"
