from pydantic import BaseModel, Field


class UiSettingsResponse(BaseModel):
    app_title: str = "K8s Daily Monitor"
    nav_labels: dict[str, str] = Field(default_factory=dict)


class UiSettingsUpdate(BaseModel):
    app_title: str | None = None
    nav_labels: dict[str, str] | None = None


class ClusterLinkItem(BaseModel):
    id: str
    label: str
    url: str
    description: str | None = None


class ClusterLinkGroup(BaseModel):
    cluster_id: str
    cluster_name: str
    links: list[ClusterLinkItem] = Field(default_factory=list)


class ClusterLinksPayload(BaseModel):
    common_links: list[ClusterLinkItem] = Field(default_factory=list)
    cluster_groups: list[ClusterLinkGroup] = Field(default_factory=list)


class ClusterLinksResponse(BaseModel):
    data: ClusterLinksPayload


class ClusterLinksUpdate(BaseModel):
    common_links: list[ClusterLinkItem] = Field(default_factory=list)
    cluster_groups: list[ClusterLinkGroup] = Field(default_factory=list)


# ── 운영레벨 (사용자 정의) ──────────────────────────────────────────────
class OperationLevelItem(BaseModel):
    """운영레벨 한 항목.
    - value: 클러스터.operation_level 에 저장되는 식별자 (영문 슬러그 권장).
    - label: 화면 표시 이름 (한글 가능).
    - color: 컬러 키 (red/amber/emerald/sky/slate/purple/blue/yellow/pink/cyan/violet/orange/muted).
    """
    value: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=64)
    color: str = Field(default="slate", max_length=32)


class OperationLevelsResponse(BaseModel):
    levels: list[OperationLevelItem] = Field(default_factory=list)


class OperationLevelsUpdate(BaseModel):
    levels: list[OperationLevelItem]
