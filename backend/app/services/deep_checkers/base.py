"""Deep checker 베이스 — 인증서/etcd/CNI/PVC/이미지/audit 공용 추상.

기존 ``app.services.checkers.base.BaseChecker`` 는 Addon + Cluster 를 묶어 동작하지만,
deep check 는 Addon 과 무관하고 ``DeepCheckDefinition`` 의 thresholds/params 를 받아서
실행되므로 별도 베이스를 둔다. 같은 fail-safe 컨벤션은 그대로 적용한다.
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from kubernetes import client, config

from app.models import Cluster, StatusEnum
from app.services.kubeconfig import ensure_kubeconfig_file

logger = logging.getLogger(__name__)


_CONNECTION_ERROR_HINTS = (
    "connection refused",
    "no route to host",
    "timed out",
    "timeout",
    "network is unreachable",
    "max retries exceeded",
    "connection error",
    "ssl:",
)


@dataclass
class DeepCheckContext:
    """체커가 실행될 때 받는 컨텍스트.

    Super Pod runner 가 채워서 넘긴다. Cluster row 가 없는 in-cluster 모드에서도
    동작해야 하므로 cluster 는 Optional.
    """

    cluster: Optional[Cluster] = None
    thresholds: dict[str, Any] = field(default_factory=dict)
    params: dict[str, Any] = field(default_factory=dict)
    # in_cluster=True 면 load_incluster_config() 사용, False 면 kubeconfig 사용.
    in_cluster: bool = False


@dataclass
class DeepCheckOutcome:
    status: StatusEnum
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0


class DeepCheckerBase(ABC):
    """Deep check 추상 베이스.

    구현체는 ``check_type`` 클래스 속성을 ``registry`` key 와 맞추고,
    ``run(ctx) -> DeepCheckOutcome`` 를 구현한다.
    """

    check_type: str = "abstract"
    display_name: str = "abstract"

    # ── K8s client (lazy) ──────────────────────────────────────
    def _v1(self, ctx: DeepCheckContext) -> client.CoreV1Api:
        if ctx.in_cluster:
            try:
                config.load_incluster_config()
            except config.ConfigException:
                config.load_kube_config()
        else:
            kc = ensure_kubeconfig_file(ctx.cluster) if ctx.cluster else None
            if kc and os.path.exists(kc):
                config.load_kube_config(config_file=kc)
            else:
                try:
                    config.load_incluster_config()
                except config.ConfigException:
                    config.load_kube_config()
        return client.CoreV1Api()

    def _kubectl(self, ctx: DeepCheckContext, *args: str, timeout: int = 30) -> subprocess.CompletedProcess:
        cmd = ["kubectl"]
        if not ctx.in_cluster and ctx.cluster is not None:
            kc = ensure_kubeconfig_file(ctx.cluster)
            if kc and os.path.exists(kc):
                cmd.extend(["--kubeconfig", kc])
            if ctx.cluster.api_endpoint:
                cmd.extend(["--server", ctx.cluster.api_endpoint])
        cmd.extend(args)
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

    # ── 실행 ────────────────────────────────────────────────────
    @abstractmethod
    def run(self, ctx: DeepCheckContext) -> DeepCheckOutcome:
        ...

    def safe_run(self, ctx: DeepCheckContext) -> DeepCheckOutcome:
        start = time.time()
        try:
            outcome = self.run(ctx)
            outcome.duration_ms = int((time.time() - start) * 1000)
            return outcome
        except FileNotFoundError as e:
            return DeepCheckOutcome(
                status=StatusEnum.pending,
                message=f"{self.display_name}: 필수 파일 없음 — {str(e)[:120]}",
                details={"error": str(e)[:500]},
                duration_ms=int((time.time() - start) * 1000),
            )
        except Exception as e:
            msg = str(e).lower()
            status = (
                StatusEnum.pending
                if any(h in msg for h in _CONNECTION_ERROR_HINTS)
                else StatusEnum.critical
            )
            logger.warning("Deep check %s failed: %s", self.check_type, e)
            return DeepCheckOutcome(
                status=status,
                message=f"{self.display_name} 실패: {str(e)[:200]}",
                details={"error": str(e)[:1000]},
                duration_ms=int((time.time() - start) * 1000),
            )
