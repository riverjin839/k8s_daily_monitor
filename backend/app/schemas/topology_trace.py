from uuid import UUID

from pydantic import BaseModel, Field


class TopologyTraceRequest(BaseModel):
    cluster_id: UUID
    namespace: str = Field(..., min_length=1, max_length=253)
    target_type: str = Field(..., pattern="^(service|pod)$")
    target_name: str = Field(..., min_length=1, max_length=253)


class TopologyHop(BaseModel):
    entity_type: str
    entity_id: str
    name: str
    interface: str | None = None
    latency_ms: float | None = None
    error_count: int | None = None


class TopologyTraceResponse(BaseModel):
    cluster_id: UUID
    namespace: str
    target_type: str
    target_name: str
    hops: list[TopologyHop]


class PacketFlowRequest(BaseModel):
    cluster_id: UUID
    host: str = Field(..., min_length=1, max_length=253)
    path: str = Field(default="/", min_length=1, max_length=512)
    protocol: str = Field(default="https", pattern="^(http|https|grpc|tcp)$")


class PacketFlowResponse(BaseModel):
    cluster_id: UUID
    host: str
    path: str
    protocol: str
    hops: list[TopologyHop]
