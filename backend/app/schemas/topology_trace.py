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
