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


# ── v2 (정책 해석 + E-W 지원) ────────────────────────────────────────────────

class PacketFlowRequestV2(BaseModel):
    cluster_id: UUID
    direction: str = Field(..., pattern="^(north-south|east-west)$")
    source: str = Field(..., min_length=1, max_length=253,
                        description="N-S: external FQDN/IP | E-W: 'ns/pod'")
    destination: str = Field(..., min_length=1, max_length=512,
                             description="'ns/pod' | 'ns/service:port' | 'ingress-host'")
    protocol: str = Field(default="tcp", pattern="^(tcp|udp|http|https|grpc)$")
    port: int | None = Field(default=None, ge=1, le=65535)
    path: str = Field(default="/", min_length=1, max_length=512)


class TopologyHopV2(BaseModel):
    entity_type: str
    entity_id: str
    name: str
    interface: str | None = None
    latency_ms: float | None = None
    error_count: int | None = None
    verdict: str = "info"            # "allow" | "deny" | "warn" | "info"
    notes: list[str] = Field(default_factory=list)
    policies: list[dict] = Field(default_factory=list)
    identity: dict | None = None
    refs: list[dict] = Field(default_factory=list)


class PacketFlowResponseV2(BaseModel):
    cluster_id: UUID
    direction: str
    source: str
    destination: str
    protocol: str
    port: int | None = None
    path: str
    hops: list[TopologyHopV2]
