"""클러스터 컴포넌트/메타 스냅샷 기록.

`cluster_config_snapshots` 테이블에 component 별 변경 히스토리를 남긴다.
동일 component 의 마지막 스냅샷과 content hash 가 동일하면 새 행을 추가하지
않으므로, 매번 호출해도 실제 변경 시에만 히스토리가 늘어난다.

- `hash_payload(...)`: payload → SHA-256
- `store_if_changed(...)`: hash 가 다르면 새 스냅샷 insert (commit 은 caller 책임)
- `record_cluster_meta_snapshots(...)`: 클러스터 메타 필드를 논리 그룹별로 일괄 기록
   (auto-update / NIC 수집 / 등록 시 호출되어 모든 수집 이벤트가 자동으로 히스토리화)
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import ClusterConfigSnapshot


def hash_payload(component: str, version: str | None, data: dict) -> str:
    blob = json.dumps(
        {"component": component, "version": version, "data": data},
        sort_keys=True, default=str,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def store_if_changed(
    db: Session,
    cluster_id: UUID,
    component: str,
    category: str | None,
    version: str | None,
    data: dict,
    now: datetime,
) -> bool:
    """마지막 스냅샷과 content hash 가 다르면 새 행을 추가. 반환: 변경 여부."""
    h = hash_payload(component, version, data)
    last = (
        db.query(ClusterConfigSnapshot)
        .filter(ClusterConfigSnapshot.cluster_id == cluster_id,
                ClusterConfigSnapshot.component == component)
        .order_by(ClusterConfigSnapshot.collected_at.desc())
        .first()
    )
    if last and last.content_hash == h:
        return False
    snap = ClusterConfigSnapshot(
        cluster_id=cluster_id,
        component=component,
        category=category,
        version=version,
        data=data,
        content_hash=h,
        collected_at=now,
    )
    db.add(snap)
    return True


def _summarize_node_ips(raw: str | None) -> list[dict]:
    """node_ips JSON 을 hash 친화적인 요약으로 변환.

    원본 JSON 을 그대로 저장하면 InternalIP 순서/SSH 시각 차이만으로 hash 가 달라져
    매 수집마다 새 스냅샷이 쌓일 수 있다. 노드 식별자/매핑된 NIC 만 모아 정렬한 형태로
    저장해 의미 있는 변경에만 히스토리가 누적되도록 한다.
    """
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    out: list[dict] = []
    for n in parsed:
        if not isinstance(n, dict):
            continue
        ifaces_summary: list[dict] = []
        for ifc in n.get("interfaces") or []:
            if not isinstance(ifc, dict):
                continue
            ifaces_summary.append({
                "name": ifc.get("name"),
                "ips": sorted(ifc.get("ips") or []),
                "mac": ifc.get("mac"),
            })
        ifaces_summary.sort(key=lambda x: (x.get("name") or ""))
        out.append({
            "name": n.get("name"),
            "ip": n.get("ip"),
            "ips": sorted(n.get("ips") or []),
            "external_ip": n.get("external_ip"),
            "master": bool(n.get("master")),
            "interfaces": ifaces_summary,
        })
    out.sort(key=lambda x: ((not x.get("master")), x.get("name") or ""))
    return out


def record_cluster_meta_snapshots(db: Session, cluster: Any, now: datetime) -> int:
    """클러스터 메타데이터를 논리 그룹별 component 로 분리해 일괄 기록.

    수집(`auto-update`, `collect-node-nics`, 등록 시) 직후 호출하면 변경된 그룹만
    스냅샷이 추가된다. 동일 그룹의 hash 가 같으면 skip — 호출 자체는 idempotent.

    반환: 새로 기록된 그룹 수 (= 실제 변경된 논리 그룹 수)
    """
    groups: dict[str, tuple[str, dict]] = {
        "cluster_meta:nodes": ("meta", {
            "node_count": cluster.node_count,
            "hostname":   cluster.hostname,
            "max_pod":    cluster.max_pod,
        }),
        "cluster_meta:internal_cidr": ("network", {
            "cidr":       cluster.cidr,
            "first_host": cluster.first_host,
            "last_host":  cluster.last_host,
        }),
        "cluster_meta:pod_cidr": ("network", {
            "pod_cidr":       cluster.pod_cidr,
            "pod_first_host": cluster.pod_first_host,
            "pod_last_host":  cluster.pod_last_host,
        }),
        "cluster_meta:svc_cidr": ("network", {
            "svc_cidr":       cluster.svc_cidr,
            "svc_first_host": cluster.svc_first_host,
            "svc_last_host":  cluster.svc_last_host,
        }),
        "cluster_meta:bonds": ("network", {
            "bond0_ip":  cluster.bond0_ip,
            "bond0_mac": cluster.bond0_mac,
            "bond1_ip":  cluster.bond1_ip,
            "bond1_mac": cluster.bond1_mac,
        }),
        "cluster_meta:cilium": ("cni", {
            "cilium_version": cluster.cilium_version,
            "cilium_config":  cluster.cilium_config,
        }),
        "cluster_meta:bgp": ("network", {
            "bgp_enabled": bool(cluster.bgp_enabled) if cluster.bgp_enabled is not None else None,
            "as_number":   cluster.as_number,
        }),
        "cluster_meta:k8s_version": ("control_plane", {
            "k8s_version": cluster.k8s_version,
        }),
        "cluster_meta:node_ips": ("network", {
            "nodes": _summarize_node_ips(cluster.node_ips),
        }),
    }

    changed = 0
    for component, (category, data) in groups.items():
        # 모든 값이 비어있으면 skip — 빈 스냅샷은 의미 없음
        if all(v in (None, "", [], False) for v in data.values()):
            continue
        if store_if_changed(
            db, cluster.id,
            component=component, category=category,
            version=None, data=data, now=now,
        ):
            changed += 1
    return changed
