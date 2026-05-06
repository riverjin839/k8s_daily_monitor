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
    images: list[NodeImageEntry] = Field(default_factory=list)


class NodeImagesListResponse(BaseModel):
    data: list[NodeImagesResponse]
