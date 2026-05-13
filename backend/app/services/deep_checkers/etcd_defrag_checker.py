"""etcd defrag/alarm 점검.

전략:
1) ``etcdctl endpoint status -w json`` 결과를 읽어 dbSize / dbSizeInUse 비율로
   단편화 비율을 계산. fragmentation > warning threshold → warning, > critical → critical.
2) ``etcdctl alarm list`` 가 비어있지 않으면 critical.

실행은 kube-system 내 etcd pod 에서 exec. 권한 없으면 pending.
"""
from __future__ import annotations

import json
from typing import Any

from app.models import StatusEnum
from app.services.deep_checkers.base import (
    DeepCheckContext,
    DeepCheckOutcome,
    DeepCheckerBase,
)


_ETCDCTL_ENV = [
    "ETCDCTL_API=3",
    "ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt",
    "ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt",
    "ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key",
]


class EtcdDefragChecker(DeepCheckerBase):
    check_type = "etcd_defrag"
    display_name = "etcd 단편화 / 알람"

    def run(self, ctx: DeepCheckContext) -> DeepCheckOutcome:
        warning_frag = float(ctx.thresholds.get("warning_fragmentation_pct", 30))
        critical_frag = float(ctx.thresholds.get("critical_fragmentation_pct", 50))

        v1 = self._v1(ctx)
        pods = v1.list_namespaced_pod(
            namespace="kube-system",
            label_selector="component=etcd",
            timeout_seconds=10,
        )
        target = None
        for p in pods.items:
            if p.status and p.status.phase == "Running":
                target = p
                break
        if target is None:
            return DeepCheckOutcome(
                status=StatusEnum.pending,
                message="etcd pod 를 찾지 못했습니다 (managed/external etcd 가능성).",
                details={"reason": "no_etcd_pod"},
            )

        endpoint_proc = self._kubectl(
            ctx,
            "-n", "kube-system", "exec", target.metadata.name, "--",
            "sh", "-c",
            f"{' '.join(_ETCDCTL_ENV)} etcdctl endpoint status -w json",
            timeout=20,
        )
        alarm_proc = self._kubectl(
            ctx,
            "-n", "kube-system", "exec", target.metadata.name, "--",
            "sh", "-c",
            f"{' '.join(_ETCDCTL_ENV)} etcdctl alarm list",
            timeout=15,
        )

        if endpoint_proc.returncode != 0:
            return DeepCheckOutcome(
                status=StatusEnum.pending,
                message="etcdctl endpoint status 실행 실패 (권한 또는 etcd 부재)",
                details={
                    "stderr": (endpoint_proc.stderr or "")[:1000],
                },
            )

        try:
            data = json.loads(endpoint_proc.stdout)
            row = data[0] if isinstance(data, list) and data else {}
            status = row.get("Status", {})
            db_size = int(status.get("dbSize", 0))
            db_size_in_use = int(status.get("dbSizeInUse", 0))
        except Exception as e:
            return DeepCheckOutcome(
                status=StatusEnum.warning,
                message=f"etcd status 파싱 실패: {e}",
                details={"raw": (endpoint_proc.stdout or "")[:1000]},
            )

        frag_pct = 0.0
        if db_size > 0:
            frag_pct = round((1 - (db_size_in_use / db_size)) * 100, 2)

        alarms = (alarm_proc.stdout or "").strip().splitlines()
        alarms = [a for a in alarms if a.strip()]

        status_enum = StatusEnum.healthy
        msg_parts: list[str] = []
        if alarms:
            status_enum = StatusEnum.critical
            msg_parts.append(f"알람 {len(alarms)}건")
        if frag_pct >= critical_frag:
            status_enum = StatusEnum.critical
            msg_parts.append(f"단편화 {frag_pct}%")
        elif frag_pct >= warning_frag and status_enum != StatusEnum.critical:
            status_enum = StatusEnum.warning
            msg_parts.append(f"단편화 {frag_pct}%")
        else:
            msg_parts.append(f"단편화 {frag_pct}%")

        return DeepCheckOutcome(
            status=status_enum,
            message=", ".join(msg_parts),
            details={
                "fragmentation_pct": frag_pct,
                "warning_pct": warning_frag,
                "critical_pct": critical_frag,
                "db_size_bytes": db_size,
                "db_size_in_use_bytes": db_size_in_use,
                "alarms": alarms,
            },
        )
