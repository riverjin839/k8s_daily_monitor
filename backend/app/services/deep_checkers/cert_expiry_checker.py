"""K8s 컨트롤 플레인 인증서 만료 점검.

전략 우선순위:
1) kube-system 의 control plane pod 에서 ``kubeadm certs check-expiration`` 실행
   (pods/exec 권한 필요). 거부되면 2번으로 fallback.
2) Secret/ConfigMap 기반 추정 (kubeadm 클러스터가 아닌 경우 pending).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from app.models import StatusEnum
from app.services.deep_checkers.base import (
    DeepCheckContext,
    DeepCheckOutcome,
    DeepCheckerBase,
)


_DAYS_RE = re.compile(r"(\d+)d")


class CertExpiryChecker(DeepCheckerBase):
    check_type = "cert_expiry"
    display_name = "인증서 만료"

    def run(self, ctx: DeepCheckContext) -> DeepCheckOutcome:
        warning_days = int(ctx.thresholds.get("warning_days", 30))
        critical_days = int(ctx.thresholds.get("critical_days", 7))

        # 1) kubeadm 기반 점검
        outcome = self._check_via_kubeadm(ctx, warning_days, critical_days)
        if outcome is not None:
            return outcome

        # 2) Secret 기반 fallback — 인증서 만료를 직접 확인할 수 없어 pending
        return DeepCheckOutcome(
            status=StatusEnum.pending,
            message="kubeadm 컨트롤 플레인 파드를 찾지 못해 인증서 만료를 직접 확인할 수 없습니다.",
            details={"reason": "kubeadm_not_found"},
        )

    def _check_via_kubeadm(
        self,
        ctx: DeepCheckContext,
        warning_days: int,
        critical_days: int,
    ) -> DeepCheckOutcome | None:
        v1 = self._v1(ctx)
        pods = v1.list_namespaced_pod(
            namespace="kube-system",
            label_selector="component=kube-apiserver",
            timeout_seconds=10,
        )
        target = None
        for p in pods.items:
            if p.status and p.status.phase == "Running":
                target = p
                break
        if target is None:
            return None

        proc = self._kubectl(
            ctx,
            "-n",
            "kube-system",
            "exec",
            target.metadata.name,
            "--",
            "kubeadm",
            "certs",
            "check-expiration",
            timeout=20,
        )
        if proc.returncode != 0:
            # exec 권한 또는 kubeadm 부재
            return DeepCheckOutcome(
                status=StatusEnum.pending,
                message="kubeadm certs check-expiration 실행 불가 (권한 또는 바이너리 부재)",
                details={
                    "returncode": proc.returncode,
                    "stderr": (proc.stderr or "")[:1000],
                },
            )

        rows = self._parse_kubeadm_output(proc.stdout)
        if not rows:
            return DeepCheckOutcome(
                status=StatusEnum.pending,
                message="kubeadm 출력 파싱 실패",
                details={"raw": (proc.stdout or "")[:2000]},
            )

        min_days = min(r["residual_days"] for r in rows)
        status = StatusEnum.healthy
        if min_days <= critical_days:
            status = StatusEnum.critical
        elif min_days <= warning_days:
            status = StatusEnum.warning

        return DeepCheckOutcome(
            status=status,
            message=f"가장 짧은 인증서: {min_days}일 남음 ({len(rows)}개 점검)",
            details={
                "min_residual_days": min_days,
                "warning_days": warning_days,
                "critical_days": critical_days,
                "rows": rows,
            },
        )

    @staticmethod
    def _parse_kubeadm_output(stdout: str) -> list[dict[str, Any]]:
        """``kubeadm certs check-expiration`` 출력의 핵심 라인 파싱.

        예시:
        ``apiserver         Aug 12, 2026 10:11 UTC   362d   ca   no``
        """
        rows: list[dict[str, Any]] = []
        for raw in (stdout or "").splitlines():
            line = raw.strip()
            if not line or line.startswith("CERTIFICATE"):
                continue
            m = _DAYS_RE.search(line)
            if not m:
                continue
            try:
                days = int(m.group(1))
            except ValueError:
                continue
            # 첫 토큰 = 인증서 이름
            name = line.split()[0]
            rows.append(
                {
                    "name": name,
                    "residual_days": days,
                    "raw": line[:200],
                }
            )
        return rows
