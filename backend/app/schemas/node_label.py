from pydantic import BaseModel, Field


class NodeInfoResponse(BaseModel):
    name: str
    labels: dict[str, str] = Field(default_factory=dict)
    taints: list[str] = Field(default_factory=list)
    role: str = "worker"
    status: str = "unknown"


class NodeListResponse(BaseModel):
    data: list[NodeInfoResponse]


class NodeLabelPatchRequest(BaseModel):
    add: dict[str, str] = Field(default_factory=dict)
    remove: list[str] = Field(default_factory=list)


class NodeLabelPatchResponse(BaseModel):
    message: str
    data: NodeInfoResponse
