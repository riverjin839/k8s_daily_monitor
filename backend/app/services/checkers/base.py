"""Strategy Pattern base class for health checkers."""
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from kubernetes import client, config

from app.models import Cluster, Addon, StatusEnum


@dataclass
class CheckResult:
    status: StatusEnum
    message: str
    response_time: int = 0  # ms
    details: Optional[dict[str, Any]] = None


class BaseChecker(ABC):
    """모든 Checker의 추상 기반 클래스"""

    def __init__(self, cluster: Cluster, addon: Addon):
        self.cluster = cluster
        self.addon = addon
        self._v1: Optional[client.CoreV1Api] = None

    # ── K8s client (lazy init, 재사용) ──────────────────────
    def _get_k8s_client(self) -> client.CoreV1Api:
        if self._v1 is not None:
            return self._v1

        if self.cluster.kubeconfig_path and os.path.exists(self.cluster.kubeconfig_path):
            config.load_kube_config(config_file=self.cluster.kubeconfig_path)
        else:
            try:
                config.load_incluster_config()
            except config.ConfigException:
                config.load_kube_config()

        self._v1 = client.CoreV1Api()
        return self._v1

    # ── 시간 측정 헬퍼 ──────────────────────────────────────
    @staticmethod
    def _elapsed_ms(start: datetime) -> int:
        return int((datetime.utcnow() - start).total_seconds() * 1000)

    # ── 서브클래스 구현 필수 ────────────────────────────────
    @abstractmethod
    def check(self) -> CheckResult:
        """실제 헬스 체크 로직. 서브클래스에서 구현."""
        ...

    # ── 안전 실행 래퍼 ──────────────────────────────────────
    def safe_check(self) -> CheckResult:
        """예외를 잡아서 critical 결과로 변환."""
        try:
            return self.check()
        except Exception as e:
            return CheckResult(
                status=StatusEnum.critical,
                message=f"{self.addon.name} check failed: {str(e)[:200]}",
                details={"error": str(e)[:500]},
            )
