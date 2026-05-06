from pydantic import BaseModel, Field


class NodeImageEntry(BaseModel):
    names: list[str] = Field(default_factory=list)
    size_bytes: int = 0


class NodeImagesResponse(BaseModel):
    node: str
    role: str = "worker"
    status: str = "unknown"
    image_count: int = 0
    total_size_bytes: int = 0
    # 노드 메타 라벨 — 라벨 기준 카드 그룹핑/필터링용. k8s API 의 .metadata.labels 그대로.
    labels: dict[str, str] = Field(default_factory=dict)
    images: list[NodeImageEntry] = Field(default_factory=list)


class NodeImagesListResponse(BaseModel):
    data: list[NodeImagesResponse]
