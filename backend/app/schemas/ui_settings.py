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
